import { Pool, type PoolClient } from "pg";

import { POSTGRES_SCHEMA_SQL } from "@nada/db";

import type { RelayEnv } from "./env";

/**
 * The query surface shared by `pg.Pool` and `pg.PoolClient`. Repositories
 * depend on this rather than on a concrete client so a method can run either
 * straight on the pool (a connection is checked out per statement and returned
 * immediately) or inside a transaction (every statement pinned to one client).
 *
 * Derived from pg's own signature so row typing behaves exactly as it did when
 * these repositories held a `pg.Client`.
 */
export type Queryable = Pick<PoolClient, "query">;

export interface RelayDb extends Queryable {
  /** Ends the pool. Only the owner of the pool may call this. */
  close: () => Promise<void>;
  /**
   * Runs `fn` inside a single BEGIN/COMMIT on one pinned connection, rolling
   * back if it throws. Required for any multi-statement write: under a pool
   * each bare `query` may land on a different connection, so a sequence of
   * dependent statements is no longer implicitly ordered against concurrent
   * writers the way it was on a single dedicated client.
   */
  withTransaction: <T>(fn: (tx: Queryable) => Promise<T>) => Promise<T>;
}

export interface RelayDbLogger {
  error: (details: unknown, message: string) => void;
}

const DEFAULT_POOL_MAX = 10;

/**
 * Creates the one Postgres pool the relay process shares across every
 * repository. Previously each repository opened its own bare `pg.Client`,
 * which meant (a) five connections that could never serve concurrent queries,
 * since a Client serialises everything onto its single socket, and (b) no
 * recovery: a dropped connection left every later query failing forever.
 */
export function createRelayDb(
  env: RelayEnv,
  logger?: RelayDbLogger
): RelayDb | null {
  if (!env.databaseUrl) {
    return null;
  }

  const pool = new Pool({
    connectionString: env.databaseUrl,
    max: env.databasePoolMax ?? DEFAULT_POOL_MAX,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000
  });

  // Without this listener an error on an *idle* pooled client is an unhandled
  // 'error' event, which takes the whole relay process down. Managed Postgres
  // recycles idle connections routinely, so this fires in normal operation.
  // The pool discards the broken client and opens a fresh one on next use.
  pool.on("error", (error) => {
    logger?.error({ err: error }, "Idle Postgres client error (pool recovers)");
  });

  return {
    // Bound rather than wrapped so pg's full set of query overloads (and its
    // row typing) survives intact.
    query: pool.query.bind(pool),
    close: () => pool.end(),
    withTransaction: async (fn) => {
      const client = await pool.connect();
      try {
        await client.query("begin");
        const result = await fn(client);
        await client.query("commit");
        return result;
      } catch (error) {
        try {
          await client.query("rollback");
        } catch {
          // The connection is already unusable; releasing it with an error
          // below tells the pool to discard rather than reuse it.
        }
        throw error;
      } finally {
        client.release();
      }
    }
  };
}

/**
 * Applies the schema exactly once per process. Every repository used to run
 * the full `POSTGRES_SCHEMA_SQL` on boot, so a four-repository relay executed
 * it four times against four connections on every cold start.
 */
export async function ensureRelaySchema(db: RelayDb): Promise<void> {
  await db.query(POSTGRES_SCHEMA_SQL);
}
