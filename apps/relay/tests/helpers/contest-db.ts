import { Client } from "pg";
import { randomBytes } from "node:crypto";

import { createRelayDb, ensureRelaySchema, type RelayDb } from "../../src/db";
import type { RelayEnv } from "../../src/env";

/**
 * Integration tests for the contest engine run against a real PostgreSQL.
 *
 * The engine's correctness lives in SQL — unique indexes are the idempotency
 * guarantee, `for update` is the concurrency guarantee, and window functions
 * produce the ranks a prize depends on. A mock database would assert that the
 * mock behaves, which is worth nothing here.
 *
 * Set TEST_DATABASE_URL (CI does) to run them. Without it they skip, loudly.
 */
export const TEST_DATABASE_URL =
  process.env["TEST_DATABASE_URL"] ?? process.env["CONTEST_TEST_DATABASE_URL"];

/** True when a database is configured, so suites can skip cleanly without it. */
export const HAS_POSTGRES = Boolean(TEST_DATABASE_URL);

export interface TestDatabase {
  db: RelayDb;
  url: string;
  drop: () => Promise<void>;
}

/**
 * Creates a throwaway database, applies the migrations, and hands back a pool.
 * A database per suite rather than a shared one with truncation: the suites
 * assert on unique-index behaviour, and a leaked row from a neighbour would
 * make a real failure look like a flake.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  if (!TEST_DATABASE_URL) {
    throw new Error("TEST_DATABASE_URL is not set.");
  }
  const name = `nada_contest_${randomBytes(6).toString("hex")}`;

  const admin = new Client({ connectionString: TEST_DATABASE_URL });
  await admin.connect();
  await admin.query(`create database ${name}`);
  await admin.end();

  const url = new URL(TEST_DATABASE_URL);
  url.pathname = `/${name}`;
  const databaseUrl = url.toString();

  const db = createRelayDb({ databaseUrl, databasePoolMax: 6 } as RelayEnv);
  if (!db) throw new Error("Test database pool was not created.");
  await ensureRelaySchema(db);

  return {
    db,
    url: databaseUrl,
    drop: async () => {
      await db.close();
      const cleanup = new Client({ connectionString: TEST_DATABASE_URL });
      await cleanup.connect();
      await cleanup.query(`drop database if exists ${name} with (force)`);
      await cleanup.end();
    }
  };
}

export const TEST_REDIS_URL = process.env["TEST_REDIS_URL"];
/** True when a Redis is configured, so the cache suite can skip cleanly. */
export const HAS_REDIS = Boolean(TEST_REDIS_URL);

/** Silences the service's logger so a passing suite prints nothing. */
export const silentLogger = {
  error: () => {},
  info: () => {},
  warn: () => {}
};
