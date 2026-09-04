import type { RelayRedis } from "../redis";
import type { ContestRepository, LeaderboardEntry } from "./repository";

/**
 * Leaderboard reads.
 *
 * Redis holds a sorted set per contest so the top-N read is O(log n + limit)
 * instead of an ordered scan of every participant on every poll. It is a cache
 * and nothing else: it is rebuilt from Postgres whenever it is cold, and every
 * path here falls back to Postgres when Redis is unavailable, so losing the
 * cache costs latency and never correctness.
 *
 * One honest limitation: a sorted set breaks ties lexicographically by member,
 * while the authoritative ranking breaks them by who joined first. Displayed
 * ranks can therefore differ from final ranks between equal scores. Everything
 * that decides money — `finalizeStandings`, the winners table — is computed in
 * Postgres, where the tiebreak is correct.
 */

export interface LeaderboardView {
  entries: LeaderboardEntry[];
  source: "redis" | "postgres";
}

interface MemberMeta {
  /** Anonymous display name. */
  n: string;
  /** Qualifying event count. */
  e: number;
}

const REBUILD_TTL_SECONDS = 6 * 60 * 60;

function boardKey(contestId: string): string {
  return `contest:${contestId}:leaderboard`;
}

function metaKey(contestId: string): string {
  return `contest:${contestId}:members`;
}

export class ContestLeaderboard {
  /** De-duplicates concurrent rebuilds of the same contest within a process. */
  private readonly rebuilds = new Map<string, Promise<void>>();

  constructor(
    private readonly repository: ContestRepository,
    private readonly redis: RelayRedis | null,
    private readonly onError: (error: unknown, message: string) => void
  ) {}

  /** Publishes one participant's new score. Best-effort by design. */
  async publishScore(
    contestId: string,
    pubkeyHash: string,
    score: number,
    displayName: string,
    events: number
  ): Promise<void> {
    if (!this.redis) return;
    try {
      const meta: MemberMeta = { n: displayName, e: events };
      await Promise.all([
        this.redis.command.zAdd(boardKey(contestId), { score, value: pubkeyHash }),
        this.redis.command.hSet(metaKey(contestId), pubkeyHash, JSON.stringify(meta)),
        this.redis.command.expire(boardKey(contestId), REBUILD_TTL_SECONDS),
        this.redis.command.expire(metaKey(contestId), REBUILD_TTL_SECONDS)
      ]);
    } catch (error) {
      // A cache write failure must never fail the scoring transaction that
      // already committed. The next rebuild repairs it.
      this.onError(error, "Contest leaderboard publish failed");
    }
  }

  /** Drops a disqualified participant from the visible board. */
  async remove(contestId: string, pubkeyHash: string): Promise<void> {
    if (!this.redis) return;
    try {
      await Promise.all([
        this.redis.command.zRem(boardKey(contestId), pubkeyHash),
        this.redis.command.hDel(metaKey(contestId), pubkeyHash)
      ]);
    } catch (error) {
      this.onError(error, "Contest leaderboard removal failed");
    }
  }

  async top(contestId: string, limit: number, offset: number): Promise<LeaderboardView> {
    if (this.redis) {
      try {
        const exists = await this.redis.command.exists(boardKey(contestId));
        if (exists === 0) {
          await this.rebuild(contestId);
        }
        const entries = await this.readFromRedis(contestId, limit, offset);
        if (entries) return { entries, source: "redis" };
      } catch (error) {
        this.onError(error, "Contest leaderboard read failed; using Postgres");
      }
    }
    return {
      entries: await this.repository.leaderboardPage(contestId, limit, offset),
      source: "postgres"
    };
  }

  /**
   * A participant's own standing. Always answered from Postgres: it is the
   * number a participant will argue about, and it costs one indexed window
   * query rather than a scan.
   */
  async standing(
    contestId: string,
    pubkeyHash: string
  ): Promise<{ rank: number | null; pointsToNextRank: number | null }> {
    const rank = await this.repository.rankOf(contestId, pubkeyHash);
    if (rank === null) return { rank: null, pointsToNextRank: null };
    const above = await this.repository.scoreAboveRank(contestId, rank);
    if (above === null) return { rank, pointsToNextRank: null };
    const participant = await this.repository.getParticipant(contestId, pubkeyHash);
    const own = participant?.currentScore ?? 0;
    return { rank, pointsToNextRank: Math.max(0, above - own + 1) };
  }

  /** Repopulates the cache from Postgres. Safe to call at any time. */
  async rebuild(contestId: string): Promise<void> {
    if (!this.redis) return;
    const inFlight = this.rebuilds.get(contestId);
    if (inFlight) return inFlight;

    const task = this.doRebuild(contestId).finally(() => {
      this.rebuilds.delete(contestId);
    });
    this.rebuilds.set(contestId, task);
    return task;
  }

  private async doRebuild(contestId: string): Promise<void> {
    if (!this.redis) return;
    try {
      const [snapshot, participants] = await Promise.all([
        this.repository.leaderboardSnapshot(contestId),
        this.repository.listParticipants(contestId, 10_000, 0)
      ]);
      const metaByHash = new Map(
        participants.map((participant) => [
          participant.pubkeyHash,
          JSON.stringify({ n: participant.displayName, e: participant.events } as MemberMeta)
        ])
      );

      const board = boardKey(contestId);
      const meta = metaKey(contestId);
      // Rebuild into fresh keys and swap, so readers never observe a partially
      // filled board — a half-rebuilt leaderboard is worse than a stale one.
      const stagingBoard = `${board}:rebuild`;
      const stagingMeta = `${meta}:rebuild`;
      await this.redis.command.del([stagingBoard, stagingMeta]);

      if (snapshot.length > 0) {
        await this.redis.command.zAdd(
          stagingBoard,
          snapshot.map((entry) => ({ score: entry.score, value: entry.pubkeyHash }))
        );
        const metaEntries: Record<string, string> = {};
        for (const entry of snapshot) {
          metaEntries[entry.pubkeyHash] =
            metaByHash.get(entry.pubkeyHash) ?? JSON.stringify({ n: "", e: 0 } as MemberMeta);
        }
        await this.redis.command.hSet(stagingMeta, metaEntries);
        await this.redis.command.rename(stagingBoard, board);
        await this.redis.command.rename(stagingMeta, meta);
        await this.redis.command.expire(board, REBUILD_TTL_SECONDS);
        await this.redis.command.expire(meta, REBUILD_TTL_SECONDS);
      } else {
        await this.redis.command.del([board, meta]);
      }
    } catch (error) {
      this.onError(error, "Contest leaderboard rebuild failed");
    }
  }

  private async readFromRedis(
    contestId: string,
    limit: number,
    offset: number
  ): Promise<LeaderboardEntry[] | null> {
    if (!this.redis) return null;
    const raw = await this.redis.command.zRangeWithScores(
      boardKey(contestId),
      offset,
      offset + limit - 1,
      { REV: true }
    );
    if (raw.length === 0) return offset === 0 ? [] : null;

    const metas = await this.redis.command.hmGet(
      metaKey(contestId),
      raw.map((entry) => entry.value)
    );
    return raw.map((entry, index) => {
      const meta = parseMeta(metas[index]);
      return {
        rank: offset + index + 1,
        pubkeyHash: entry.value,
        displayName: meta.n,
        score: entry.score,
        events: meta.e
      };
    });
  }
}

function parseMeta(raw: string | null | undefined): MemberMeta {
  if (!raw) return { n: "", e: 0 };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      const record = parsed as Partial<MemberMeta>;
      return {
        n: typeof record.n === "string" ? record.n : "",
        e: typeof record.e === "number" ? record.e : 0
      };
    }
  } catch {
    // Corrupt cache entry: treated as unknown metadata, not as a failure.
  }
  return { n: "", e: 0 };
}
