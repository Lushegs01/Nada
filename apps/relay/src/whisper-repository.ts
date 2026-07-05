import { Client } from "pg";

import { POSTGRES_SCHEMA_SQL } from "@nada/db";

import type { RelayEnv } from "./env";

// A lightweight snapshot of the Echo a Ripple was created from, stored inline so
// the quoted content survives even if the source Echo is later deleted.
export interface WhisperRippleSource {
  authorName: string;
  body: string;
  createdAt: number;
  id: string;
}

export interface WhisperEchoInput {
  authorName: string;
  authorPubkeyHash: string;
  body: string;
  createdAt: number;
  id: string;
  rippleOf?: WhisperRippleSource;
}

export interface WhisperReflectionInput {
  authorName: string;
  authorPubkeyHash: string;
  body: string;
  createdAt: number;
  echoId: string;
  id: string;
}

export interface WhisperReflectionView {
  authorName: string;
  authorPubkeyHash: string;
  body: string;
  createdAt: number;
  id: string;
}

// A fully-aggregated Echo as returned to a specific viewer: global counts plus
// whether this viewer has Echoed (liked) or Rippled it.
export interface WhisperEchoView {
  authorName: string;
  authorPubkeyHash: string;
  body: string;
  createdAt: number;
  echoCount: number;
  echoedByViewer: boolean;
  id: string;
  reflections: WhisperReflectionView[];
  rippleCount: number;
  rippledByViewer: boolean;
  rippleOf?: WhisperRippleSource;
}

export interface WhisperRepository {
  addReflection: (reflection: WhisperReflectionInput) => Promise<void>;
  addRipple: (echoId: string, ripplerPubkeyHash: string, at: number) => Promise<void>;
  close: () => Promise<void>;
  createEcho: (echo: WhisperEchoInput) => Promise<void>;
  deleteEcho: (id: string, authorPubkeyHash: string) => Promise<void>;
  listFeed: (
    viewerPubkeyHash: string,
    since: number,
    limit: number
  ) => Promise<WhisperEchoView[]>;
  setReaction: (
    echoId: string,
    reactorPubkeyHash: string,
    on: boolean,
    at: number
  ) => Promise<void>;
}

// Deterministic welcome Echoes so a brand-new deployment's global feed isn't
// empty. Fixed UUIDs make the seed idempotent across restarts. They start with
// zero interactions — real Echo/Reflect/Ripple activity accrues honestly.
const SEED_AUTHOR_HASH = "0".repeat(64);
type WhisperSeedEcho = Omit<WhisperEchoInput, "createdAt">;
export const WHISPER_SEED_ECHOES: WhisperSeedEcho[] = [
  {
    authorName: "nada.signal",
    authorPubkeyHash: SEED_AUTHOR_HASH,
    body: "Welcome to Whispers — NADA's public feed. Post an Echo and everyone on NADA can see and interact with it. No real names, no followers, no tracking. 🌫️",
    id: "00000000-0000-4000-8000-0000000000a1"
  },
  {
    authorName: "quiet.fox",
    authorPubkeyHash: SEED_AUTHOR_HASH,
    body: "Your identity here is a key, not a face. Whisper freely — Reflect, Ripple, and Echo what resonates.",
    id: "00000000-0000-4000-8000-0000000000a2"
  }
];

// Stamp seeds with a recent timestamp on first insert (idempotent afterwards)
// so they fall inside the feed's default lookback window and appear on top.
function seedCreatedAt(index: number): number {
  return Date.now() - index * 1000;
}

export async function createWhisperRepository(
  env: RelayEnv
): Promise<WhisperRepository> {
  if (env.databaseUrl) {
    const client = new Client({ connectionString: env.databaseUrl });
    await client.connect();
    await client.query(POSTGRES_SCHEMA_SQL);
    const repo = new PostgresWhisperRepository(client);
    await repo.seed();
    return repo;
  }

  const repo = new MemoryWhisperRepository();
  repo.seedSync();
  return repo;
}

class PostgresWhisperRepository implements WhisperRepository {
  constructor(private readonly client: Client) {}

  async seed(): Promise<void> {
    for (const [index, echo] of WHISPER_SEED_ECHOES.entries()) {
      await this.client.query(
        `insert into whisper_echoes
           (id, author_pubkey_hash, author_name, body, created_at_ms, updated_at)
         values ($1, $2, $3, $4, $5, now())
         on conflict (id) do nothing`,
        [echo.id, echo.authorPubkeyHash, echo.authorName, echo.body, seedCreatedAt(index)]
      );
    }
  }

  async close(): Promise<void> {
    await this.client.end();
  }

  async createEcho(echo: WhisperEchoInput): Promise<void> {
    await this.client.query(
      `insert into whisper_echoes
         (id, author_pubkey_hash, author_name, body,
          ripple_of_id, ripple_of_author_name, ripple_of_body, ripple_of_created_at_ms,
          created_at_ms, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
       on conflict (id) do nothing`,
      [
        echo.id,
        echo.authorPubkeyHash,
        echo.authorName,
        echo.body,
        echo.rippleOf?.id ?? null,
        echo.rippleOf?.authorName ?? null,
        echo.rippleOf?.body ?? null,
        echo.rippleOf?.createdAt ?? null,
        echo.createdAt
      ]
    );
  }

  async deleteEcho(id: string, authorPubkeyHash: string): Promise<void> {
    const result = await this.client.query(
      "delete from whisper_echoes where id = $1 and author_pubkey_hash = $2",
      [id, authorPubkeyHash]
    );
    // Only cascade child rows once we've confirmed the author owned the echo.
    if (result.rowCount && result.rowCount > 0) {
      await this.client.query("delete from whisper_reflections where echo_id = $1", [id]);
      await this.client.query("delete from whisper_reactions where echo_id = $1", [id]);
      await this.client.query("delete from whisper_ripples where echo_id = $1", [id]);
    }
  }

  async addReflection(reflection: WhisperReflectionInput): Promise<void> {
    await this.client.query(
      `insert into whisper_reflections
         (id, echo_id, author_pubkey_hash, author_name, body, created_at_ms)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (id) do nothing`,
      [
        reflection.id,
        reflection.echoId,
        reflection.authorPubkeyHash,
        reflection.authorName,
        reflection.body,
        reflection.createdAt
      ]
    );
  }

  async setReaction(
    echoId: string,
    reactorPubkeyHash: string,
    on: boolean,
    at: number
  ): Promise<void> {
    if (on) {
      await this.client.query(
        `insert into whisper_reactions (echo_id, reactor_pubkey_hash, created_at_ms)
         values ($1, $2, $3)
         on conflict (echo_id, reactor_pubkey_hash) do nothing`,
        [echoId, reactorPubkeyHash, at]
      );
    } else {
      await this.client.query(
        "delete from whisper_reactions where echo_id = $1 and reactor_pubkey_hash = $2",
        [echoId, reactorPubkeyHash]
      );
    }
  }

  async addRipple(echoId: string, ripplerPubkeyHash: string, at: number): Promise<void> {
    await this.client.query(
      `insert into whisper_ripples (echo_id, rippler_pubkey_hash, created_at_ms)
       values ($1, $2, $3)
       on conflict (echo_id, rippler_pubkey_hash) do nothing`,
      [echoId, ripplerPubkeyHash, at]
    );
  }

  async listFeed(
    viewerPubkeyHash: string,
    since: number,
    limit: number
  ): Promise<WhisperEchoView[]> {
    const echoResult = await this.client.query(
      `select id, author_pubkey_hash, author_name, body,
              ripple_of_id, ripple_of_author_name, ripple_of_body, ripple_of_created_at_ms,
              created_at_ms
       from whisper_echoes
       where created_at_ms >= $1
       order by created_at_ms desc
       limit $2`,
      [since, limit]
    );
    const echoIds = echoResult.rows.map((row) => row.id as string);
    if (echoIds.length === 0) return [];

    const [reactionCounts, rippleCounts, viewerReactions, viewerRipples, reflections] =
      await Promise.all([
        this.client.query(
          `select echo_id, count(*)::int as n from whisper_reactions
           where echo_id = any($1::uuid[]) group by echo_id`,
          [echoIds]
        ),
        this.client.query(
          `select echo_id, count(*)::int as n from whisper_ripples
           where echo_id = any($1::uuid[]) group by echo_id`,
          [echoIds]
        ),
        this.client.query(
          `select echo_id from whisper_reactions
           where echo_id = any($1::uuid[]) and reactor_pubkey_hash = $2`,
          [echoIds, viewerPubkeyHash]
        ),
        this.client.query(
          `select echo_id from whisper_ripples
           where echo_id = any($1::uuid[]) and rippler_pubkey_hash = $2`,
          [echoIds, viewerPubkeyHash]
        ),
        this.client.query(
          `select id, echo_id, author_pubkey_hash, author_name, body, created_at_ms
           from whisper_reflections
           where echo_id = any($1::uuid[])
           order by created_at_ms asc`,
          [echoIds]
        )
      ]);

    const countMap = (rows: Array<{ echo_id: string; n: number }>): Map<string, number> =>
      new Map(rows.map((row) => [row.echo_id, Number(row.n)]));
    const echoCounts = countMap(reactionCounts.rows);
    const rippleCountMap = countMap(rippleCounts.rows);
    const viewerEchoed = new Set(viewerReactions.rows.map((row) => row.echo_id as string));
    const viewerRippled = new Set(viewerRipples.rows.map((row) => row.echo_id as string));
    const reflectionsByEcho = new Map<string, WhisperReflectionView[]>();
    for (const row of reflections.rows) {
      const list = reflectionsByEcho.get(row.echo_id) ?? [];
      list.push({
        authorName: row.author_name,
        authorPubkeyHash: row.author_pubkey_hash,
        body: row.body,
        createdAt: Number(row.created_at_ms),
        id: row.id
      });
      reflectionsByEcho.set(row.echo_id, list);
    }

    return echoResult.rows.map((row) => ({
      authorName: row.author_name,
      authorPubkeyHash: row.author_pubkey_hash,
      body: row.body,
      createdAt: Number(row.created_at_ms),
      echoCount: echoCounts.get(row.id) ?? 0,
      echoedByViewer: viewerEchoed.has(row.id),
      id: row.id,
      reflections: reflectionsByEcho.get(row.id) ?? [],
      rippleCount: rippleCountMap.get(row.id) ?? 0,
      rippledByViewer: viewerRippled.has(row.id),
      ...(row.ripple_of_id
        ? {
            rippleOf: {
              authorName: row.ripple_of_author_name,
              body: row.ripple_of_body,
              createdAt: Number(row.ripple_of_created_at_ms),
              id: row.ripple_of_id
            }
          }
        : {})
    }));
  }
}

class MemoryWhisperRepository implements WhisperRepository {
  private readonly echoes = new Map<string, WhisperEchoInput>();
  private readonly reflections = new Map<string, WhisperReflectionInput[]>();
  private readonly reactions = new Map<string, Set<string>>();
  private readonly ripples = new Map<string, Set<string>>();

  seedSync(): void {
    for (const [index, echo] of WHISPER_SEED_ECHOES.entries()) {
      if (!this.echoes.has(echo.id)) {
        this.echoes.set(echo.id, { ...echo, createdAt: seedCreatedAt(index) });
      }
    }
  }

  async close(): Promise<void> {
    this.echoes.clear();
    this.reflections.clear();
    this.reactions.clear();
    this.ripples.clear();
  }

  async createEcho(echo: WhisperEchoInput): Promise<void> {
    if (!this.echoes.has(echo.id)) this.echoes.set(echo.id, echo);
  }

  async deleteEcho(id: string, authorPubkeyHash: string): Promise<void> {
    const existing = this.echoes.get(id);
    if (existing?.authorPubkeyHash === authorPubkeyHash) {
      this.echoes.delete(id);
      this.reflections.delete(id);
      this.reactions.delete(id);
      this.ripples.delete(id);
    }
  }

  async addReflection(reflection: WhisperReflectionInput): Promise<void> {
    if (!this.echoes.has(reflection.echoId)) return;
    const list = this.reflections.get(reflection.echoId) ?? [];
    if (list.some((item) => item.id === reflection.id)) return;
    list.push(reflection);
    this.reflections.set(reflection.echoId, list);
  }

  async setReaction(
    echoId: string,
    reactorPubkeyHash: string,
    on: boolean
  ): Promise<void> {
    if (!this.echoes.has(echoId)) return;
    const set = this.reactions.get(echoId) ?? new Set<string>();
    if (on) set.add(reactorPubkeyHash);
    else set.delete(reactorPubkeyHash);
    this.reactions.set(echoId, set);
  }

  async addRipple(echoId: string, ripplerPubkeyHash: string): Promise<void> {
    const set = this.ripples.get(echoId) ?? new Set<string>();
    set.add(ripplerPubkeyHash);
    this.ripples.set(echoId, set);
  }

  async listFeed(
    viewerPubkeyHash: string,
    since: number,
    limit: number
  ): Promise<WhisperEchoView[]> {
    return Array.from(this.echoes.values())
      .filter((echo) => echo.createdAt >= since)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit)
      .map((echo) => {
        const reactionSet = this.reactions.get(echo.id) ?? new Set<string>();
        const rippleSet = this.ripples.get(echo.id) ?? new Set<string>();
        return {
          authorName: echo.authorName,
          authorPubkeyHash: echo.authorPubkeyHash,
          body: echo.body,
          createdAt: echo.createdAt,
          echoCount: reactionSet.size,
          echoedByViewer: reactionSet.has(viewerPubkeyHash),
          id: echo.id,
          reflections: (this.reflections.get(echo.id) ?? [])
            .slice()
            .sort((a, b) => a.createdAt - b.createdAt)
            .map((reflection) => ({
              authorName: reflection.authorName,
              authorPubkeyHash: reflection.authorPubkeyHash,
              body: reflection.body,
              createdAt: reflection.createdAt,
              id: reflection.id
            })),
          rippleCount: rippleSet.size,
          rippledByViewer: rippleSet.has(viewerPubkeyHash),
          ...(echo.rippleOf ? { rippleOf: echo.rippleOf } : {})
        };
      });
  }
}
