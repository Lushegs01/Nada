import { randomUUID } from "node:crypto";

import { Client } from "pg";

import { POSTGRES_SCHEMA_SQL } from "@nada/db";
import type { WhisperNotificationKind } from "@nada/types";

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
  /** Immediate parent Reflection when this is a nested (threaded) reply. */
  parentId?: string;
  /** Anonymous handle of the parent author, preserved as an "@name" mention. */
  replyToName?: string;
}

export interface WhisperReflectionView {
  authorName: string;
  authorPubkeyHash: string;
  body: string;
  createdAt: number;
  id: string;
  parentId?: string;
  replyToName?: string;
  /** Tombstone: the reply was deleted but keeps its slot to preserve the thread. */
  deleted: boolean;
  likeCount: number;
  likedByViewer: boolean;
  /** Direct (non-deleted) replies to this reflection. */
  replyCount: number;
}

// A fully-aggregated Echo as returned to a specific viewer: global counts plus
// whether this viewer has Echoed (liked) or Rippled it. `reflections` is a
// small newest-first preview; full threads are paged via listReflections.
export interface WhisperEchoView {
  authorName: string;
  authorPubkeyHash: string;
  body: string;
  createdAt: number;
  echoCount: number;
  echoedByViewer: boolean;
  id: string;
  reflectionCount: number;
  reflections: WhisperReflectionView[];
  rippleCount: number;
  rippledByViewer: boolean;
  rippleOf?: WhisperRippleSource;
}

export interface WhisperReflectionPage {
  hasMore: boolean;
  reflections: WhisperReflectionView[];
  total: number;
}

// Context returned by mutations so the routes layer can fan out notifications
// without issuing extra lookups (who owns the Echo / the parent reply).
export interface ReflectionCreateResult {
  created: boolean;
  echoAuthorName?: string;
  echoAuthorPubkeyHash?: string;
  echoBody?: string;
  parentAuthorPubkeyHash?: string;
}

export interface ReactionTargetResult {
  authorPubkeyHash: string;
  body: string;
  echoId: string;
}

export type WhisperDmPrivacy = "everyone" | "ghosts" | "none";

export interface WhisperProfileRecord {
  avatar: string;
  bio: string;
  displayName: string;
  dmPrivacy: WhisperDmPrivacy;
  institution: string;
  /** Ed25519 public key (base64) captured from a verified identity proof. */
  pubkey: string;
  pubkeyHash: string;
  showActivity: boolean;
  showLikes: boolean;
  createdAt: number;
}

export interface WhisperProfileView {
  avatar: string;
  bio: string;
  displayName: string;
  dmPrivacy: WhisperDmPrivacy;
  echoCount: number;
  followerCount: number;
  followingCount: number;
  followedByViewer: boolean;
  institution: string;
  joinedAt: number | null;
  likesReceived: number;
  pubkey: string;
  pubkeyHash: string;
  reflectionCount: number;
  showActivity: boolean;
  showLikes: boolean;
}

/** A reflection in a profile's "Reflects" tab, carrying its Echo context. */
export interface WhisperAuthorReflectionView extends WhisperReflectionView {
  echoAuthorName: string;
  echoBody: string;
  echoId: string;
}

export interface WhisperFollowEntry {
  avatar: string;
  displayName: string;
  pubkeyHash: string;
}

export interface WhisperNotificationInput {
  actorName: string;
  actorPubkeyHash: string;
  createdAt: number;
  echoId?: string;
  kind: WhisperNotificationKind;
  preview: string;
  recipientPubkeyHash: string;
  reflectionId?: string;
}

export interface WhisperNotificationView {
  actorName: string;
  actorPubkeyHash: string;
  createdAt: number;
  echoId?: string;
  id: string;
  kind: WhisperNotificationKind;
  preview: string;
  read: boolean;
  reflectionId?: string;
}

export interface WhisperNotificationPage {
  notifications: WhisperNotificationView[];
  unreadCount: number;
}

const NOTIFICATION_PREVIEW_MAX = 140;

export function notificationPreview(body: string): string {
  const trimmed = body.trim().replace(/\s+/g, " ");
  return trimmed.length > NOTIFICATION_PREVIEW_MAX
    ? `${trimmed.slice(0, NOTIFICATION_PREVIEW_MAX - 1)}…`
    : trimmed;
}

export interface WhisperRepository {
  addReflection: (reflection: WhisperReflectionInput) => Promise<ReflectionCreateResult>;
  addRipple: (
    echoId: string,
    ripplerPubkeyHash: string,
    at: number
  ) => Promise<ReactionTargetResult | null>;
  close: () => Promise<void>;
  countFeed: (
    since: number,
    options?: { authorPubkeyHash?: string }
  ) => Promise<number>;
  createEcho: (echo: WhisperEchoInput) => Promise<void>;
  deleteEcho: (id: string, authorPubkeyHash: string) => Promise<boolean>;
  deleteReflection: (
    id: string,
    authorPubkeyHash: string
  ) => Promise<"hard" | "soft" | null>;
  listFeed: (
    viewerPubkeyHash: string,
    since: number,
    limit: number,
    options?: { authorPubkeyHash?: string; before?: number }
  ) => Promise<WhisperEchoView[]>;
  listReflections: (
    echoId: string,
    viewerPubkeyHash: string,
    limit: number,
    before?: number
  ) => Promise<WhisperReflectionPage>;
  setReaction: (
    echoId: string,
    reactorPubkeyHash: string,
    on: boolean,
    at: number
  ) => Promise<ReactionTargetResult | null>;
  setReflectionReaction: (
    reflectionId: string,
    reactorPubkeyHash: string,
    on: boolean,
    at: number
  ) => Promise<ReactionTargetResult | null>;

  getProfile: (
    pubkeyHash: string,
    viewerPubkeyHash: string
  ) => Promise<WhisperProfileView>;
  upsertProfile: (profile: WhisperProfileRecord) => Promise<void>;
  /** Capture an author's relay-verified pubkey so other ghosts can DM them.
   *  Creates a minimal profile row when none exists; never overwrites a
   *  user-chosen display name. */
  recordAuthorPubkey: (
    pubkeyHash: string,
    displayName: string,
    pubkey: string,
    at: number
  ) => Promise<void>;
  listAuthorReflections: (
    authorPubkeyHash: string,
    viewerPubkeyHash: string,
    limit: number,
    before?: number
  ) => Promise<WhisperAuthorReflectionView[]>;
  listLikedEchoes: (
    reactorPubkeyHash: string,
    viewerPubkeyHash: string,
    limit: number,
    before?: number
  ) => Promise<WhisperEchoView[]>;
  listFollows: (
    pubkeyHash: string,
    direction: "followers" | "following",
    limit: number
  ) => Promise<WhisperFollowEntry[]>;
  setFollow: (
    followerPubkeyHash: string,
    followeePubkeyHash: string,
    on: boolean,
    at: number
  ) => Promise<boolean>;

  addNotification: (notification: WhisperNotificationInput) => Promise<boolean>;
  removeNotification: (key: {
    actorPubkeyHash: string;
    echoId?: string;
    kind: WhisperNotificationKind;
    recipientPubkeyHash: string;
    reflectionId?: string;
  }) => Promise<void>;
  listNotifications: (
    recipientPubkeyHash: string,
    limit: number,
    before?: number
  ) => Promise<WhisperNotificationPage>;
  markNotificationsRead: (
    recipientPubkeyHash: string,
    at: number,
    ids?: string[]
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
    body: "Welcome to Whispers — NADA's public feed. Post an Echo and everyone on NADA can see and interact with it. No real names, no tracking. 🌫️",
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

  async deleteEcho(id: string, authorPubkeyHash: string): Promise<boolean> {
    const result = await this.client.query(
      "delete from whisper_echoes where id = $1 and author_pubkey_hash = $2",
      [id, authorPubkeyHash]
    );
    // Only cascade child rows once we've confirmed the author owned the echo.
    if (!result.rowCount || result.rowCount === 0) return false;
    await this.client.query(
      `delete from whisper_reflection_reactions
       where reflection_id in (select id from whisper_reflections where echo_id = $1)`,
      [id]
    );
    await this.client.query("delete from whisper_reflections where echo_id = $1", [id]);
    await this.client.query("delete from whisper_reactions where echo_id = $1", [id]);
    await this.client.query("delete from whisper_ripples where echo_id = $1", [id]);
    // Stale notifications must not deep-link into a deleted Echo.
    await this.client.query("delete from whisper_notifications where echo_id = $1", [id]);
    return true;
  }

  async addReflection(
    reflection: WhisperReflectionInput
  ): Promise<ReflectionCreateResult> {
    const echoResult = await this.client.query(
      "select author_pubkey_hash, author_name, body from whisper_echoes where id = $1",
      [reflection.echoId]
    );
    if (echoResult.rowCount === 0) return { created: false };

    let rootId = reflection.id;
    let parentAuthor: string | undefined;
    if (reflection.parentId) {
      const parentResult = await this.client.query(
        `select author_pubkey_hash, root_id, deleted_at_ms from whisper_reflections
         where id = $1 and echo_id = $2`,
        [reflection.parentId, reflection.echoId]
      );
      // Reject replies to unknown parents or parents from another Echo so the
      // thread structure can't be corrupted by a forged request.
      if (parentResult.rowCount === 0) return { created: false };
      const parent = parentResult.rows[0];
      rootId = parent.root_id ?? reflection.parentId;
      if (!parent.deleted_at_ms) parentAuthor = parent.author_pubkey_hash;
    }

    const inserted = await this.client.query(
      `insert into whisper_reflections
         (id, echo_id, author_pubkey_hash, author_name, body, created_at_ms,
          parent_id, root_id, reply_to_name)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       on conflict (id) do nothing`,
      [
        reflection.id,
        reflection.echoId,
        reflection.authorPubkeyHash,
        reflection.authorName,
        reflection.body,
        reflection.createdAt,
        reflection.parentId ?? null,
        reflection.parentId ? rootId : reflection.id,
        reflection.replyToName ?? null
      ]
    );
    if (!inserted.rowCount || inserted.rowCount === 0) return { created: false };
    return {
      created: true,
      echoAuthorName: echoResult.rows[0].author_name,
      echoAuthorPubkeyHash: echoResult.rows[0].author_pubkey_hash,
      echoBody: echoResult.rows[0].body,
      ...(parentAuthor ? { parentAuthorPubkeyHash: parentAuthor } : {})
    };
  }

  async deleteReflection(
    id: string,
    authorPubkeyHash: string
  ): Promise<"hard" | "soft" | null> {
    const existing = await this.client.query(
      `select author_pubkey_hash, deleted_at_ms from whisper_reflections where id = $1`,
      [id]
    );
    if (existing.rowCount === 0) return null;
    if (existing.rows[0].author_pubkey_hash !== authorPubkeyHash) return null;
    if (existing.rows[0].deleted_at_ms) return null;

    const children = await this.client.query(
      "select count(*)::int as n from whisper_reflections where parent_id = $1",
      [id]
    );
    const hasChildren = Number(children.rows[0].n) > 0;

    await this.client.query(
      "delete from whisper_reflection_reactions where reflection_id = $1",
      [id]
    );
    await this.client.query(
      "delete from whisper_notifications where reflection_id = $1",
      [id]
    );
    if (hasChildren) {
      // Tombstone: keep the row so child replies keep their place in the thread.
      await this.client.query(
        `update whisper_reflections
         set body = '', reply_to_name = null, deleted_at_ms = $2
         where id = $1`,
        [id, Date.now()]
      );
      return "soft";
    }
    await this.client.query("delete from whisper_reflections where id = $1", [id]);
    return "hard";
  }

  async setReaction(
    echoId: string,
    reactorPubkeyHash: string,
    on: boolean,
    at: number
  ): Promise<ReactionTargetResult | null> {
    const target = await this.client.query(
      "select author_pubkey_hash, body from whisper_echoes where id = $1",
      [echoId]
    );
    if (target.rowCount === 0) return null;
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
    return {
      authorPubkeyHash: target.rows[0].author_pubkey_hash,
      body: target.rows[0].body,
      echoId
    };
  }

  async setReflectionReaction(
    reflectionId: string,
    reactorPubkeyHash: string,
    on: boolean,
    at: number
  ): Promise<ReactionTargetResult | null> {
    const target = await this.client.query(
      `select author_pubkey_hash, body, echo_id from whisper_reflections
       where id = $1 and deleted_at_ms is null`,
      [reflectionId]
    );
    if (target.rowCount === 0) return null;
    if (on) {
      await this.client.query(
        `insert into whisper_reflection_reactions
           (reflection_id, reactor_pubkey_hash, created_at_ms)
         values ($1, $2, $3)
         on conflict (reflection_id, reactor_pubkey_hash) do nothing`,
        [reflectionId, reactorPubkeyHash, at]
      );
    } else {
      await this.client.query(
        `delete from whisper_reflection_reactions
         where reflection_id = $1 and reactor_pubkey_hash = $2`,
        [reflectionId, reactorPubkeyHash]
      );
    }
    return {
      authorPubkeyHash: target.rows[0].author_pubkey_hash,
      body: target.rows[0].body,
      echoId: target.rows[0].echo_id
    };
  }

  async addRipple(
    echoId: string,
    ripplerPubkeyHash: string,
    at: number
  ): Promise<ReactionTargetResult | null> {
    const target = await this.client.query(
      "select author_pubkey_hash, body from whisper_echoes where id = $1",
      [echoId]
    );
    if (target.rowCount === 0) return null;
    await this.client.query(
      `insert into whisper_ripples (echo_id, rippler_pubkey_hash, created_at_ms)
       values ($1, $2, $3)
       on conflict (echo_id, rippler_pubkey_hash) do nothing`,
      [echoId, ripplerPubkeyHash, at]
    );
    return {
      authorPubkeyHash: target.rows[0].author_pubkey_hash,
      body: target.rows[0].body,
      echoId
    };
  }

  // Hydrate raw reflection rows with like counts, viewer likes and direct
  // reply counts using three batched queries — never one query per row.
  private async hydrateReflections(
    rows: any[],
    viewerPubkeyHash: string
  ): Promise<WhisperReflectionView[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.id as string);
    const [likeCounts, viewerLikes, replyCounts] = await Promise.all([
      this.client.query(
        `select reflection_id, count(*)::int as n from whisper_reflection_reactions
         where reflection_id = any($1::uuid[]) group by reflection_id`,
        [ids]
      ),
      this.client.query(
        `select reflection_id from whisper_reflection_reactions
         where reflection_id = any($1::uuid[]) and reactor_pubkey_hash = $2`,
        [ids, viewerPubkeyHash]
      ),
      this.client.query(
        `select parent_id, count(*)::int as n from whisper_reflections
         where parent_id = any($1::uuid[]) and deleted_at_ms is null
         group by parent_id`,
        [ids]
      )
    ]);
    const likeMap = new Map<string, number>(
      likeCounts.rows.map((row) => [row.reflection_id, Number(row.n)])
    );
    const likedSet = new Set(viewerLikes.rows.map((row) => row.reflection_id as string));
    const replyMap = new Map<string, number>(
      replyCounts.rows.map((row) => [row.parent_id, Number(row.n)])
    );
    return rows.map((row) => ({
      authorName: row.author_name,
      authorPubkeyHash: row.author_pubkey_hash,
      body: row.deleted_at_ms ? "" : row.body,
      createdAt: Number(row.created_at_ms),
      deleted: Boolean(row.deleted_at_ms),
      id: row.id,
      likeCount: likeMap.get(row.id) ?? 0,
      likedByViewer: likedSet.has(row.id),
      replyCount: replyMap.get(row.id) ?? 0,
      ...(row.parent_id ? { parentId: row.parent_id } : {}),
      ...(row.reply_to_name ? { replyToName: row.reply_to_name } : {})
    }));
  }

  async listReflections(
    echoId: string,
    viewerPubkeyHash: string,
    limit: number,
    before?: number
  ): Promise<WhisperReflectionPage> {
    // Page over top-level replies newest-first; each page carries every nested
    // descendant of its roots via the denormalised root_id — a single indexed
    // query instead of a recursive walk. Tombstoned roots are kept because
    // they anchor live children.
    const rootsResult = await this.client.query(
      `select id, echo_id, author_pubkey_hash, author_name, body, created_at_ms,
              parent_id, root_id, reply_to_name, deleted_at_ms
       from whisper_reflections
       where echo_id = $1 and parent_id is null
         and ($2::bigint is null or created_at_ms < $2)
       order by created_at_ms desc
       limit $3`,
      [echoId, before ?? null, limit + 1]
    );
    const hasMore = rootsResult.rows.length > limit;
    const roots = rootsResult.rows.slice(0, limit);
    const rootIds = roots.map((row) => row.id as string);

    const [descendants, totalResult] = await Promise.all([
      rootIds.length > 0
        ? this.client.query(
            `select id, echo_id, author_pubkey_hash, author_name, body, created_at_ms,
                    parent_id, root_id, reply_to_name, deleted_at_ms
             from whisper_reflections
             where root_id = any($1::uuid[]) and parent_id is not null
             order by created_at_ms asc`,
            [rootIds]
          )
        : Promise.resolve({ rows: [] as any[] }),
      this.client.query(
        `select count(*)::int as n from whisper_reflections
         where echo_id = $1 and deleted_at_ms is null`,
        [echoId]
      )
    ]);

    const reflections = await this.hydrateReflections(
      [...roots, ...descendants.rows],
      viewerPubkeyHash
    );
    return { hasMore, reflections, total: Number(totalResult.rows[0].n) };
  }

  async listFeed(
    viewerPubkeyHash: string,
    since: number,
    limit: number,
    options: { authorPubkeyHash?: string; before?: number } = {}
  ): Promise<WhisperEchoView[]> {
    const echoResult = await this.client.query(
      `select id, author_pubkey_hash, author_name, body,
              ripple_of_id, ripple_of_author_name, ripple_of_body, ripple_of_created_at_ms,
              created_at_ms
       from whisper_echoes
       where created_at_ms >= $1
         and ($3::bigint is null or created_at_ms < $3)
         and ($4::text is null or author_pubkey_hash = $4)
       order by created_at_ms desc
       limit $2`,
      [since, limit, options.before ?? null, options.authorPubkeyHash ?? null]
    );
    return this.hydrateEchoRows(echoResult.rows, viewerPubkeyHash);
  }

  async countFeed(
    since: number,
    options: { authorPubkeyHash?: string } = {}
  ): Promise<number> {
    const result = await this.client.query<{ n: string }>(
      `select count(*) as n
       from whisper_echoes
       where created_at_ms >= $1
         and ($2::text is null or author_pubkey_hash = $2)`,
      [since, options.authorPubkeyHash ?? null]
    );
    return Number(result.rows[0]?.n ?? 0);
  }

  // Turn raw whisper_echoes rows into viewer-personalised views. All counts,
  // viewer flags and reply previews come from six batched queries keyed by the
  // whole id set — never one query per Echo.
  private async hydrateEchoRows(
    echoRows: any[],
    viewerPubkeyHash: string
  ): Promise<WhisperEchoView[]> {
    const echoIds = echoRows.map((row) => row.id as string);
    if (echoIds.length === 0) return [];

    const [
      reactionCounts,
      rippleCounts,
      viewerReactions,
      viewerRipples,
      reflectionCounts,
      previewRows
    ] = await Promise.all([
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
        `select echo_id, count(*)::int as n from whisper_reflections
         where echo_id = any($1::uuid[]) and deleted_at_ms is null
         group by echo_id`,
        [echoIds]
      ),
      // Newest few replies per Echo as a collapsed-card preview; the full
      // thread is paged lazily through listReflections when expanded.
      this.client.query(
        `select id, echo_id, author_pubkey_hash, author_name, body, created_at_ms,
                parent_id, root_id, reply_to_name, deleted_at_ms
         from (
           select r.*, row_number() over (
             partition by echo_id order by created_at_ms desc
           ) as rn
           from whisper_reflections r
           where echo_id = any($1::uuid[]) and deleted_at_ms is null
         ) ranked
         where rn <= 2`,
        [echoIds]
      )
    ]);

    const countMap = (rows: Array<{ echo_id: string; n: number }>): Map<string, number> =>
      new Map(rows.map((row) => [row.echo_id, Number(row.n)]));
    const echoCounts = countMap(reactionCounts.rows);
    const rippleCountMap = countMap(rippleCounts.rows);
    const reflectionCountMap = countMap(reflectionCounts.rows);
    const viewerEchoed = new Set(viewerReactions.rows.map((row) => row.echo_id as string));
    const viewerRippled = new Set(viewerRipples.rows.map((row) => row.echo_id as string));

    const previews = await this.hydrateReflections(previewRows.rows, viewerPubkeyHash);
    const previewByEcho = new Map<string, WhisperReflectionView[]>();
    for (const [index, row] of previewRows.rows.entries()) {
      const view = previews[index]!;
      const list = previewByEcho.get(row.echo_id) ?? [];
      list.push(view);
      previewByEcho.set(row.echo_id, list);
    }
    for (const list of previewByEcho.values()) {
      list.sort((a, b) => a.createdAt - b.createdAt);
    }

    return echoRows.map((row) => ({
      authorName: row.author_name,
      authorPubkeyHash: row.author_pubkey_hash,
      body: row.body,
      createdAt: Number(row.created_at_ms),
      echoCount: echoCounts.get(row.id) ?? 0,
      echoedByViewer: viewerEchoed.has(row.id),
      id: row.id,
      reflectionCount: reflectionCountMap.get(row.id) ?? 0,
      reflections: previewByEcho.get(row.id) ?? [],
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

  async getProfile(
    pubkeyHash: string,
    viewerPubkeyHash: string
  ): Promise<WhisperProfileView> {
    const [profile, stats, follows, viewerFollow] = await Promise.all([
      this.client.query(
        `select display_name, bio, institution, show_activity, created_at_ms,
                pubkey, avatar, show_likes, dm_privacy
         from whisper_profiles where pubkey_hash = $1`,
        [pubkeyHash]
      ),
      this.client.query(
        `select
           (select count(*)::int from whisper_echoes where author_pubkey_hash = $1)
             as echo_count,
           (select count(*)::int from whisper_reflections
             where author_pubkey_hash = $1 and deleted_at_ms is null)
             as reflection_count,
           (select coalesce(min(created_at_ms), 0) from whisper_echoes
             where author_pubkey_hash = $1) as first_echo_at,
           (select count(*)::int from whisper_reactions r
             join whisper_echoes e on e.id = r.echo_id
             where e.author_pubkey_hash = $1) as echo_likes,
           (select count(*)::int from whisper_reflection_reactions rr
             join whisper_reflections f on f.id = rr.reflection_id
             where f.author_pubkey_hash = $1) as reflection_likes`,
        [pubkeyHash]
      ),
      this.client.query(
        `select
           (select count(*)::int from whisper_follows where followee_pubkey_hash = $1)
             as followers,
           (select count(*)::int from whisper_follows where follower_pubkey_hash = $1)
             as following`,
        [pubkeyHash]
      ),
      this.client.query(
        `select 1 from whisper_follows
         where follower_pubkey_hash = $2 and followee_pubkey_hash = $1`,
        [pubkeyHash, viewerPubkeyHash]
      )
    ]);
    const profileRow = profile.rows[0];
    const statsRow = stats.rows[0];
    const followRow = follows.rows[0];
    const joinedAt =
      Number(profileRow?.created_at_ms ?? 0) || Number(statsRow.first_echo_at) || null;
    return {
      avatar: profileRow?.avatar ?? "",
      bio: profileRow?.bio ?? "",
      displayName: profileRow?.display_name ?? "",
      dmPrivacy: (profileRow?.dm_privacy as WhisperDmPrivacy) ?? "everyone",
      echoCount: Number(statsRow.echo_count),
      followedByViewer: (viewerFollow.rowCount ?? 0) > 0,
      followerCount: Number(followRow.followers),
      followingCount: Number(followRow.following),
      institution: profileRow?.institution ?? "",
      joinedAt,
      likesReceived: Number(statsRow.echo_likes) + Number(statsRow.reflection_likes),
      pubkey: profileRow?.pubkey ?? "",
      pubkeyHash,
      reflectionCount: Number(statsRow.reflection_count),
      showActivity: profileRow?.show_activity ?? true,
      showLikes: profileRow?.show_likes ?? true
    };
  }

  async upsertProfile(profile: WhisperProfileRecord): Promise<void> {
    // An empty pubkey/avatar in the update means "keep whatever we had" — the
    // verified pubkey especially must survive profile edits.
    await this.client.query(
      `insert into whisper_profiles
         (pubkey_hash, display_name, bio, institution, show_activity,
          pubkey, avatar, show_likes, dm_privacy, created_at_ms, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
       on conflict (pubkey_hash) do update set
         display_name = excluded.display_name,
         bio = excluded.bio,
         institution = excluded.institution,
         show_activity = excluded.show_activity,
         pubkey = case when excluded.pubkey = '' then whisper_profiles.pubkey
                       else excluded.pubkey end,
         avatar = excluded.avatar,
         show_likes = excluded.show_likes,
         dm_privacy = excluded.dm_privacy,
         updated_at = now()`,
      [
        profile.pubkeyHash,
        profile.displayName,
        profile.bio,
        profile.institution,
        profile.showActivity,
        profile.pubkey,
        profile.avatar,
        profile.showLikes,
        profile.dmPrivacy,
        profile.createdAt
      ]
    );
  }

  async recordAuthorPubkey(
    pubkeyHash: string,
    displayName: string,
    pubkey: string,
    at: number
  ): Promise<void> {
    if (!pubkey) return;
    await this.client.query(
      `insert into whisper_profiles
         (pubkey_hash, display_name, pubkey, created_at_ms, updated_at)
       values ($1, $2, $3, $4, now())
       on conflict (pubkey_hash) do update set
         pubkey = excluded.pubkey,
         updated_at = now()`,
      [pubkeyHash, displayName, pubkey, at]
    );
  }

  async listAuthorReflections(
    authorPubkeyHash: string,
    viewerPubkeyHash: string,
    limit: number,
    before?: number
  ): Promise<WhisperAuthorReflectionView[]> {
    const rows = await this.client.query(
      `select r.id, r.echo_id, r.author_pubkey_hash, r.author_name, r.body,
              r.created_at_ms, r.parent_id, r.root_id, r.reply_to_name, r.deleted_at_ms,
              e.body as echo_body, e.author_name as echo_author_name
       from whisper_reflections r
       join whisper_echoes e on e.id = r.echo_id
       where r.author_pubkey_hash = $1 and r.deleted_at_ms is null
         and ($3::bigint is null or r.created_at_ms < $3)
       order by r.created_at_ms desc
       limit $2`,
      [authorPubkeyHash, limit, before ?? null]
    );
    const hydrated = await this.hydrateReflections(rows.rows, viewerPubkeyHash);
    return hydrated.map((view, index) => ({
      ...view,
      echoAuthorName: rows.rows[index].echo_author_name,
      echoBody: rows.rows[index].echo_body,
      echoId: rows.rows[index].echo_id
    }));
  }

  async listLikedEchoes(
    reactorPubkeyHash: string,
    viewerPubkeyHash: string,
    limit: number,
    before?: number
  ): Promise<WhisperEchoView[]> {
    // Ordered by when the like happened, not when the Echo was posted.
    const rows = await this.client.query(
      `select e.id, e.author_pubkey_hash, e.author_name, e.body,
              e.ripple_of_id, e.ripple_of_author_name, e.ripple_of_body,
              e.ripple_of_created_at_ms, e.created_at_ms
       from whisper_reactions x
       join whisper_echoes e on e.id = x.echo_id
       where x.reactor_pubkey_hash = $1
         and ($3::bigint is null or x.created_at_ms < $3)
       order by x.created_at_ms desc
       limit $2`,
      [reactorPubkeyHash, limit, before ?? null]
    );
    return this.hydrateEchoRows(rows.rows, viewerPubkeyHash);
  }

  async listFollows(
    pubkeyHash: string,
    direction: "followers" | "following",
    limit: number
  ): Promise<WhisperFollowEntry[]> {
    const [edgeColumn, selectColumn] =
      direction === "followers"
        ? ["followee_pubkey_hash", "follower_pubkey_hash"]
        : ["follower_pubkey_hash", "followee_pubkey_hash"];
    const rows = await this.client.query(
      `select f.${selectColumn} as hash,
              coalesce(p.display_name, '') as display_name,
              coalesce(p.avatar, '') as avatar
       from whisper_follows f
       left join whisper_profiles p on p.pubkey_hash = f.${selectColumn}
       where f.${edgeColumn} = $1
       order by f.created_at_ms desc
       limit $2`,
      [pubkeyHash, limit]
    );
    return rows.rows.map((row) => ({
      avatar: row.avatar,
      displayName: row.display_name,
      pubkeyHash: row.hash
    }));
  }

  async setFollow(
    followerPubkeyHash: string,
    followeePubkeyHash: string,
    on: boolean,
    at: number
  ): Promise<boolean> {
    if (followerPubkeyHash === followeePubkeyHash) return false;
    if (on) {
      const result = await this.client.query(
        `insert into whisper_follows
           (follower_pubkey_hash, followee_pubkey_hash, created_at_ms)
         values ($1, $2, $3)
         on conflict (follower_pubkey_hash, followee_pubkey_hash) do nothing`,
        [followerPubkeyHash, followeePubkeyHash, at]
      );
      return Boolean(result.rowCount && result.rowCount > 0);
    }
    await this.client.query(
      `delete from whisper_follows
       where follower_pubkey_hash = $1 and followee_pubkey_hash = $2`,
      [followerPubkeyHash, followeePubkeyHash]
    );
    return false;
  }

  async addNotification(notification: WhisperNotificationInput): Promise<boolean> {
    // Never notify a user about their own action.
    if (notification.recipientPubkeyHash === notification.actorPubkeyHash) return false;
    const result = await this.client.query(
      `insert into whisper_notifications
         (id, recipient_pubkey_hash, actor_pubkey_hash, actor_name, kind,
          echo_id, reflection_id, preview, created_at_ms)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       on conflict (recipient_pubkey_hash, actor_pubkey_hash, kind,
                    coalesce(echo_id, '00000000-0000-0000-0000-000000000000'::uuid),
                    coalesce(reflection_id, '00000000-0000-0000-0000-000000000000'::uuid))
       do nothing`,
      [
        randomUUID(),
        notification.recipientPubkeyHash,
        notification.actorPubkeyHash,
        notification.actorName,
        notification.kind,
        notification.echoId ?? null,
        notification.reflectionId ?? null,
        notification.preview,
        notification.createdAt
      ]
    );
    return Boolean(result.rowCount && result.rowCount > 0);
  }

  async removeNotification(key: {
    actorPubkeyHash: string;
    echoId?: string;
    kind: WhisperNotificationKind;
    recipientPubkeyHash: string;
    reflectionId?: string;
  }): Promise<void> {
    await this.client.query(
      `delete from whisper_notifications
       where recipient_pubkey_hash = $1 and actor_pubkey_hash = $2 and kind = $3
         and echo_id is not distinct from $4
         and reflection_id is not distinct from $5`,
      [
        key.recipientPubkeyHash,
        key.actorPubkeyHash,
        key.kind,
        key.echoId ?? null,
        key.reflectionId ?? null
      ]
    );
  }

  async listNotifications(
    recipientPubkeyHash: string,
    limit: number,
    before?: number
  ): Promise<WhisperNotificationPage> {
    const [rows, unread] = await Promise.all([
      this.client.query(
        `select id, actor_pubkey_hash, actor_name, kind, echo_id, reflection_id,
                preview, created_at_ms, read_at_ms
         from whisper_notifications
         where recipient_pubkey_hash = $1
           and ($2::bigint is null or created_at_ms < $2)
         order by created_at_ms desc
         limit $3`,
        [recipientPubkeyHash, before ?? null, limit]
      ),
      this.client.query(
        `select count(*)::int as n from whisper_notifications
         where recipient_pubkey_hash = $1 and read_at_ms is null`,
        [recipientPubkeyHash]
      )
    ]);
    return {
      notifications: rows.rows.map((row) => ({
        actorName: row.actor_name,
        actorPubkeyHash: row.actor_pubkey_hash,
        createdAt: Number(row.created_at_ms),
        id: row.id,
        kind: row.kind,
        preview: row.preview,
        read: Boolean(row.read_at_ms),
        ...(row.echo_id ? { echoId: row.echo_id } : {}),
        ...(row.reflection_id ? { reflectionId: row.reflection_id } : {})
      })),
      unreadCount: Number(unread.rows[0].n)
    };
  }

  async markNotificationsRead(
    recipientPubkeyHash: string,
    at: number,
    ids?: string[]
  ): Promise<void> {
    if (ids && ids.length > 0) {
      await this.client.query(
        `update whisper_notifications set read_at_ms = $2
         where recipient_pubkey_hash = $1 and id = any($3::uuid[])
           and read_at_ms is null`,
        [recipientPubkeyHash, at, ids]
      );
      return;
    }
    await this.client.query(
      `update whisper_notifications set read_at_ms = $2
       where recipient_pubkey_hash = $1 and read_at_ms is null`,
      [recipientPubkeyHash, at]
    );
  }
}

interface MemoryReflection extends WhisperReflectionInput {
  deletedAt?: number;
  rootId: string;
}

interface MemoryNotification extends WhisperNotificationInput {
  id: string;
  readAt?: number;
}

class MemoryWhisperRepository implements WhisperRepository {
  private readonly echoes = new Map<string, WhisperEchoInput>();
  private readonly reflections = new Map<string, MemoryReflection>();
  /** echoId → reactor → liked-at timestamp */
  private readonly reactions = new Map<string, Map<string, number>>();
  private readonly reflectionReactions = new Map<string, Set<string>>();
  private readonly ripples = new Map<string, Set<string>>();
  private readonly profiles = new Map<string, WhisperProfileRecord>();
  /** follower → set of followees */
  private readonly follows = new Map<string, Set<string>>();
  private readonly notifications: MemoryNotification[] = [];

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
    this.reflectionReactions.clear();
    this.ripples.clear();
    this.profiles.clear();
    this.follows.clear();
    this.notifications.length = 0;
  }

  async createEcho(echo: WhisperEchoInput): Promise<void> {
    if (!this.echoes.has(echo.id)) this.echoes.set(echo.id, echo);
  }

  async deleteEcho(id: string, authorPubkeyHash: string): Promise<boolean> {
    const existing = this.echoes.get(id);
    if (existing?.authorPubkeyHash !== authorPubkeyHash) return false;
    this.echoes.delete(id);
    for (const [reflectionId, reflection] of this.reflections) {
      if (reflection.echoId === id) {
        this.reflections.delete(reflectionId);
        this.reflectionReactions.delete(reflectionId);
      }
    }
    this.reactions.delete(id);
    this.ripples.delete(id);
    this.pruneNotifications((n) => n.echoId === id);
    return true;
  }

  async addReflection(
    reflection: WhisperReflectionInput
  ): Promise<ReflectionCreateResult> {
    const echo = this.echoes.get(reflection.echoId);
    if (!echo) return { created: false };
    if (this.reflections.has(reflection.id)) return { created: false };

    let rootId = reflection.id;
    let parentAuthor: string | undefined;
    if (reflection.parentId) {
      const parent = this.reflections.get(reflection.parentId);
      if (!parent || parent.echoId !== reflection.echoId) return { created: false };
      rootId = parent.rootId;
      if (!parent.deletedAt) parentAuthor = parent.authorPubkeyHash;
    }
    this.reflections.set(reflection.id, { ...reflection, rootId });
    return {
      created: true,
      echoAuthorName: echo.authorName,
      echoAuthorPubkeyHash: echo.authorPubkeyHash,
      echoBody: echo.body,
      ...(parentAuthor ? { parentAuthorPubkeyHash: parentAuthor } : {})
    };
  }

  async deleteReflection(
    id: string,
    authorPubkeyHash: string
  ): Promise<"hard" | "soft" | null> {
    const existing = this.reflections.get(id);
    if (!existing || existing.authorPubkeyHash !== authorPubkeyHash) return null;
    if (existing.deletedAt) return null;
    this.reflectionReactions.delete(id);
    this.pruneNotifications((n) => n.reflectionId === id);
    const hasChildren = Array.from(this.reflections.values()).some(
      (reflection) => reflection.parentId === id
    );
    if (hasChildren) {
      const tombstone: MemoryReflection = {
        ...existing,
        body: "",
        deletedAt: Date.now()
      };
      delete tombstone.replyToName;
      this.reflections.set(id, tombstone);
      return "soft";
    }
    this.reflections.delete(id);
    return "hard";
  }

  async setReaction(
    echoId: string,
    reactorPubkeyHash: string,
    on: boolean,
    at: number
  ): Promise<ReactionTargetResult | null> {
    const echo = this.echoes.get(echoId);
    if (!echo) return null;
    const likes = this.reactions.get(echoId) ?? new Map<string, number>();
    if (on) {
      if (!likes.has(reactorPubkeyHash)) likes.set(reactorPubkeyHash, at);
    } else {
      likes.delete(reactorPubkeyHash);
    }
    this.reactions.set(echoId, likes);
    return { authorPubkeyHash: echo.authorPubkeyHash, body: echo.body, echoId };
  }

  async setReflectionReaction(
    reflectionId: string,
    reactorPubkeyHash: string,
    on: boolean
  ): Promise<ReactionTargetResult | null> {
    const reflection = this.reflections.get(reflectionId);
    if (!reflection || reflection.deletedAt) return null;
    const set = this.reflectionReactions.get(reflectionId) ?? new Set<string>();
    if (on) set.add(reactorPubkeyHash);
    else set.delete(reactorPubkeyHash);
    this.reflectionReactions.set(reflectionId, set);
    return {
      authorPubkeyHash: reflection.authorPubkeyHash,
      body: reflection.body,
      echoId: reflection.echoId
    };
  }

  async addRipple(
    echoId: string,
    ripplerPubkeyHash: string
  ): Promise<ReactionTargetResult | null> {
    const echo = this.echoes.get(echoId);
    if (!echo) return null;
    const set = this.ripples.get(echoId) ?? new Set<string>();
    set.add(ripplerPubkeyHash);
    this.ripples.set(echoId, set);
    return { authorPubkeyHash: echo.authorPubkeyHash, body: echo.body, echoId };
  }

  private reflectionView(
    reflection: MemoryReflection,
    viewerPubkeyHash: string
  ): WhisperReflectionView {
    const likes = this.reflectionReactions.get(reflection.id) ?? new Set<string>();
    const replyCount = Array.from(this.reflections.values()).filter(
      (item) => item.parentId === reflection.id && !item.deletedAt
    ).length;
    return {
      authorName: reflection.authorName,
      authorPubkeyHash: reflection.authorPubkeyHash,
      body: reflection.deletedAt ? "" : reflection.body,
      createdAt: reflection.createdAt,
      deleted: Boolean(reflection.deletedAt),
      id: reflection.id,
      likeCount: likes.size,
      likedByViewer: likes.has(viewerPubkeyHash),
      replyCount,
      ...(reflection.parentId ? { parentId: reflection.parentId } : {}),
      ...(reflection.replyToName ? { replyToName: reflection.replyToName } : {})
    };
  }

  async listReflections(
    echoId: string,
    viewerPubkeyHash: string,
    limit: number,
    before?: number
  ): Promise<WhisperReflectionPage> {
    const all = Array.from(this.reflections.values()).filter(
      (reflection) => reflection.echoId === echoId
    );
    const roots = all
      .filter(
        (reflection) =>
          !reflection.parentId && (before === undefined || reflection.createdAt < before)
      )
      .sort((a, b) => b.createdAt - a.createdAt);
    const pageRoots = roots.slice(0, limit);
    const rootIds = new Set(pageRoots.map((reflection) => reflection.id));
    const descendants = all
      .filter((reflection) => reflection.parentId && rootIds.has(reflection.rootId))
      .sort((a, b) => a.createdAt - b.createdAt);
    return {
      hasMore: roots.length > limit,
      reflections: [...pageRoots, ...descendants].map((reflection) =>
        this.reflectionView(reflection, viewerPubkeyHash)
      ),
      total: all.filter((reflection) => !reflection.deletedAt).length
    };
  }

  private echoView(echo: WhisperEchoInput, viewerPubkeyHash: string): WhisperEchoView {
    const likes = this.reactions.get(echo.id) ?? new Map<string, number>();
    const rippleSet = this.ripples.get(echo.id) ?? new Set<string>();
    const live = Array.from(this.reflections.values()).filter(
      (reflection) => reflection.echoId === echo.id && !reflection.deletedAt
    );
    const preview = [...live]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 2)
      .sort((a, b) => a.createdAt - b.createdAt);
    return {
      authorName: echo.authorName,
      authorPubkeyHash: echo.authorPubkeyHash,
      body: echo.body,
      createdAt: echo.createdAt,
      echoCount: likes.size,
      echoedByViewer: likes.has(viewerPubkeyHash),
      id: echo.id,
      reflectionCount: live.length,
      reflections: preview.map((reflection) =>
        this.reflectionView(reflection, viewerPubkeyHash)
      ),
      rippleCount: rippleSet.size,
      rippledByViewer: rippleSet.has(viewerPubkeyHash),
      ...(echo.rippleOf ? { rippleOf: echo.rippleOf } : {})
    };
  }

  async listFeed(
    viewerPubkeyHash: string,
    since: number,
    limit: number,
    options: { authorPubkeyHash?: string; before?: number } = {}
  ): Promise<WhisperEchoView[]> {
    return Array.from(this.echoes.values())
      .filter(
        (echo) =>
          echo.createdAt >= since &&
          (options.before === undefined || echo.createdAt < options.before) &&
          (options.authorPubkeyHash === undefined ||
            echo.authorPubkeyHash === options.authorPubkeyHash)
      )
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit)
      .map((echo) => this.echoView(echo, viewerPubkeyHash));
  }

  async countFeed(
    since: number,
    options: { authorPubkeyHash?: string } = {}
  ): Promise<number> {
    return Array.from(this.echoes.values()).filter(
      (echo) =>
        echo.createdAt >= since &&
        (options.authorPubkeyHash === undefined ||
          echo.authorPubkeyHash === options.authorPubkeyHash)
    ).length;
  }

  async listAuthorReflections(
    authorPubkeyHash: string,
    viewerPubkeyHash: string,
    limit: number,
    before?: number
  ): Promise<WhisperAuthorReflectionView[]> {
    return Array.from(this.reflections.values())
      .filter(
        (reflection) =>
          reflection.authorPubkeyHash === authorPubkeyHash &&
          !reflection.deletedAt &&
          this.echoes.has(reflection.echoId) &&
          (before === undefined || reflection.createdAt < before)
      )
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit)
      .map((reflection) => {
        const echo = this.echoes.get(reflection.echoId)!;
        return {
          ...this.reflectionView(reflection, viewerPubkeyHash),
          echoAuthorName: echo.authorName,
          echoBody: echo.body,
          echoId: echo.id
        };
      });
  }

  async listLikedEchoes(
    reactorPubkeyHash: string,
    viewerPubkeyHash: string,
    limit: number,
    before?: number
  ): Promise<WhisperEchoView[]> {
    const liked: Array<{ at: number; echo: WhisperEchoInput }> = [];
    for (const [echoId, likes] of this.reactions) {
      const at = likes.get(reactorPubkeyHash);
      const echo = this.echoes.get(echoId);
      if (at !== undefined && echo && (before === undefined || at < before)) {
        liked.push({ at, echo });
      }
    }
    return liked
      .sort((a, b) => b.at - a.at)
      .slice(0, limit)
      .map(({ echo }) => this.echoView(echo, viewerPubkeyHash));
  }

  async listFollows(
    pubkeyHash: string,
    direction: "followers" | "following",
    limit: number
  ): Promise<WhisperFollowEntry[]> {
    const hashes: string[] = [];
    if (direction === "following") {
      hashes.push(...(this.follows.get(pubkeyHash) ?? new Set<string>()));
    } else {
      for (const [follower, followees] of this.follows) {
        if (followees.has(pubkeyHash)) hashes.push(follower);
      }
    }
    return hashes.slice(0, limit).map((hash) => ({
      avatar: this.profiles.get(hash)?.avatar ?? "",
      displayName: this.profiles.get(hash)?.displayName ?? "",
      pubkeyHash: hash
    }));
  }

  async getProfile(
    pubkeyHash: string,
    viewerPubkeyHash: string
  ): Promise<WhisperProfileView> {
    const profile = this.profiles.get(pubkeyHash);
    const authoredEchoes = Array.from(this.echoes.values()).filter(
      (echo) => echo.authorPubkeyHash === pubkeyHash
    );
    const authoredReflections = Array.from(this.reflections.values()).filter(
      (reflection) => reflection.authorPubkeyHash === pubkeyHash && !reflection.deletedAt
    );
    let likesReceived = 0;
    for (const echo of authoredEchoes) {
      likesReceived += (this.reactions.get(echo.id) ?? new Map()).size;
    }
    for (const reflection of authoredReflections) {
      likesReceived += (this.reflectionReactions.get(reflection.id) ?? new Set()).size;
    }
    let followerCount = 0;
    for (const followees of this.follows.values()) {
      if (followees.has(pubkeyHash)) followerCount += 1;
    }
    const firstEchoAt = authoredEchoes.reduce(
      (min, echo) => Math.min(min, echo.createdAt),
      Number.POSITIVE_INFINITY
    );
    return {
      avatar: profile?.avatar ?? "",
      bio: profile?.bio ?? "",
      displayName: profile?.displayName ?? "",
      dmPrivacy: profile?.dmPrivacy ?? "everyone",
      echoCount: authoredEchoes.length,
      followedByViewer: this.follows.get(viewerPubkeyHash)?.has(pubkeyHash) ?? false,
      followerCount,
      followingCount: this.follows.get(pubkeyHash)?.size ?? 0,
      institution: profile?.institution ?? "",
      joinedAt:
        profile?.createdAt ??
        (Number.isFinite(firstEchoAt) ? firstEchoAt : null),
      likesReceived,
      pubkey: profile?.pubkey ?? "",
      pubkeyHash,
      reflectionCount: authoredReflections.length,
      showActivity: profile?.showActivity ?? true,
      showLikes: profile?.showLikes ?? true
    };
  }

  async upsertProfile(profile: WhisperProfileRecord): Promise<void> {
    const existing = this.profiles.get(profile.pubkeyHash);
    this.profiles.set(profile.pubkeyHash, {
      ...profile,
      createdAt: existing?.createdAt ?? profile.createdAt,
      // The relay-verified pubkey must survive profile edits that omit it.
      pubkey: profile.pubkey || existing?.pubkey || ""
    });
  }

  async recordAuthorPubkey(
    pubkeyHash: string,
    displayName: string,
    pubkey: string,
    at: number
  ): Promise<void> {
    if (!pubkey) return;
    const existing = this.profiles.get(pubkeyHash);
    if (existing) {
      this.profiles.set(pubkeyHash, { ...existing, pubkey });
      return;
    }
    this.profiles.set(pubkeyHash, {
      avatar: "",
      bio: "",
      createdAt: at,
      displayName,
      dmPrivacy: "everyone",
      institution: "",
      pubkey,
      pubkeyHash,
      showActivity: true,
      showLikes: true
    });
  }

  async setFollow(
    followerPubkeyHash: string,
    followeePubkeyHash: string,
    on: boolean
  ): Promise<boolean> {
    if (followerPubkeyHash === followeePubkeyHash) return false;
    const set = this.follows.get(followerPubkeyHash) ?? new Set<string>();
    if (on) {
      if (set.has(followeePubkeyHash)) return false;
      set.add(followeePubkeyHash);
      this.follows.set(followerPubkeyHash, set);
      return true;
    }
    set.delete(followeePubkeyHash);
    this.follows.set(followerPubkeyHash, set);
    return false;
  }

  private notificationKey(notification: {
    actorPubkeyHash: string;
    echoId?: string;
    kind: WhisperNotificationKind;
    recipientPubkeyHash: string;
    reflectionId?: string;
  }): string {
    return [
      notification.recipientPubkeyHash,
      notification.actorPubkeyHash,
      notification.kind,
      notification.echoId ?? "",
      notification.reflectionId ?? ""
    ].join("|");
  }

  async addNotification(notification: WhisperNotificationInput): Promise<boolean> {
    if (notification.recipientPubkeyHash === notification.actorPubkeyHash) return false;
    const key = this.notificationKey(notification);
    if (this.notifications.some((item) => this.notificationKey(item) === key)) {
      return false;
    }
    this.notifications.push({ ...notification, id: randomUUID() });
    return true;
  }

  async removeNotification(key: {
    actorPubkeyHash: string;
    echoId?: string;
    kind: WhisperNotificationKind;
    recipientPubkeyHash: string;
    reflectionId?: string;
  }): Promise<void> {
    const target = this.notificationKey(key);
    this.pruneNotifications((item) => this.notificationKey(item) === target);
  }

  private pruneNotifications(
    predicate: (notification: MemoryNotification) => boolean
  ): void {
    for (let index = this.notifications.length - 1; index >= 0; index -= 1) {
      if (predicate(this.notifications[index]!)) this.notifications.splice(index, 1);
    }
  }

  async listNotifications(
    recipientPubkeyHash: string,
    limit: number,
    before?: number
  ): Promise<WhisperNotificationPage> {
    const mine = this.notifications.filter(
      (item) => item.recipientPubkeyHash === recipientPubkeyHash
    );
    return {
      notifications: mine
        .filter((item) => before === undefined || item.createdAt < before)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, limit)
        .map((item) => ({
          actorName: item.actorName,
          actorPubkeyHash: item.actorPubkeyHash,
          createdAt: item.createdAt,
          id: item.id,
          kind: item.kind,
          preview: item.preview,
          read: Boolean(item.readAt),
          ...(item.echoId ? { echoId: item.echoId } : {}),
          ...(item.reflectionId ? { reflectionId: item.reflectionId } : {})
        })),
      unreadCount: mine.filter((item) => !item.readAt).length
    };
  }

  async markNotificationsRead(
    recipientPubkeyHash: string,
    at: number,
    ids?: string[]
  ): Promise<void> {
    const idSet = ids && ids.length > 0 ? new Set(ids) : null;
    for (const item of this.notifications) {
      if (item.recipientPubkeyHash !== recipientPubkeyHash || item.readAt) continue;
      if (idSet && !idSet.has(item.id)) continue;
      item.readAt = at;
    }
  }
}
