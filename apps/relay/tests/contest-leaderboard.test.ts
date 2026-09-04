import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { ContestLeaderboard } from "../src/contest/leaderboard";
import { ContestRepository } from "../src/contest/repository";
import { defaultRules } from "../src/contest/rules";
import { createRelayRedis, type RelayRedis } from "../src/redis";
import type { RelayEnv } from "../src/env";
import {
  HAS_POSTGRES,
  HAS_REDIS,
  TEST_REDIS_URL,
  createTestDatabase,
  type TestDatabase
} from "./helpers/contest-db";

/**
 * The leaderboard cache, against a real Redis.
 *
 * This is the one part of the engine whose correctness cannot be read off the
 * source: it depends on what node-redis actually does with `ZRANGE … REV`, on
 * rename-into-place being atomic for readers, and on every failure path
 * genuinely falling back to Postgres rather than throwing into a request.
 */

const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);

describe.skipIf(!HAS_POSTGRES || !HAS_REDIS)("contest leaderboard cache", () => {
  let database: TestDatabase;
  let redis: RelayRedis | null;
  let repository: ContestRepository;
  let leaderboard: ContestLeaderboard;
  let contestId: string;
  const errors: string[] = [];

  beforeAll(async () => {
    database = await createTestDatabase();
    redis = await createRelayRedis({ redisUrl: TEST_REDIS_URL } as RelayEnv);
  }, 60_000);

  afterAll(async () => {
    await redis?.close();
    await database?.drop();
  });

  beforeEach(async () => {
    errors.length = 0;
    await database.db.query("delete from contests");
    repository = new ContestRepository(database.db);
    leaderboard = new ContestLeaderboard(repository, redis, (_error, message) => {
      errors.push(message);
    });

    const contest = await repository.createContest({
      name: "Board",
      slug: `board-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      description: "",
      startAtMs: Date.now() - 1_000,
      endAtMs: Date.now() + 86_400_000,
      entryFeeMinor: 0,
      entryCurrency: "NGN",
      prizeAmountMinor: 0,
      prizeCurrency: "NGN",
      rules: defaultRules(),
      createdBy: "admin"
    });
    contestId = contest.id;

    for (const [hash, name, score] of [
      [A, "Ghost_82", 18_420],
      [B, "Ghost_14", 17_980],
      [C, "Ghost_91", 17_410]
    ] as Array<[string, string, number]>) {
      await repository.upsertParticipant({
        contestId,
        pubkeyHash: hash,
        displayName: name,
        paymentStatus: "not_required",
        eligibilityStatus: "eligible"
      });
      await database.db.query(
        "update contest_participants set current_score = $3 where contest_id = $1 and pubkey_hash = $2",
        [contestId, hash, score]
      );
    }
  });

  it("rebuilds a cold cache from Postgres and serves it in rank order", async () => {
    const view = await leaderboard.top(contestId, 10, 0);

    expect(view.source).toBe("redis");
    expect(view.entries.map((entry) => entry.pubkeyHash)).toEqual([A, B, C]);
    expect(view.entries.map((entry) => entry.rank)).toEqual([1, 2, 3]);
    expect(view.entries[0]?.score).toBe(18_420);
    expect(view.entries[0]?.displayName).toBe("Ghost_82");
    expect(errors).toHaveLength(0);
  });

  it("pages without repeating or skipping an entry", async () => {
    const first = await leaderboard.top(contestId, 2, 0);
    const second = await leaderboard.top(contestId, 2, 2);
    expect(first.entries.map((entry) => entry.pubkeyHash)).toEqual([A, B]);
    expect(second.entries.map((entry) => entry.pubkeyHash)).toEqual([C]);
    expect(second.entries[0]?.rank).toBe(3);
  });

  it("reflects a published score change immediately", async () => {
    await leaderboard.top(contestId, 10, 0);
    await leaderboard.publishScore(contestId, C, 99_999, "Ghost_91", 42);

    const view = await leaderboard.top(contestId, 10, 0);
    expect(view.entries[0]?.pubkeyHash).toBe(C);
    expect(view.entries[0]?.score).toBe(99_999);
    expect(view.entries[0]?.events).toBe(42);
  });

  it("drops a removed participant from the cached board", async () => {
    await leaderboard.top(contestId, 10, 0);
    await leaderboard.remove(contestId, A);

    const view = await leaderboard.top(contestId, 10, 0);
    expect(view.entries.map((entry) => entry.pubkeyHash)).toEqual([B, C]);
  });

  it("rebuilds after the cache is lost entirely", async () => {
    await leaderboard.top(contestId, 10, 0);
    // Targeted rather than FLUSHDB: this suite may be pointed at a developer's
    // own Redis, and a test that wipes it is a test nobody runs twice.
    await redis?.command.del([
      `contest:${contestId}:leaderboard`,
      `contest:${contestId}:members`
    ]);

    const view = await leaderboard.top(contestId, 10, 0);
    expect(view.entries.map((entry) => entry.pubkeyHash)).toEqual([A, B, C]);
  });

  it("keeps disqualified participants off the board", async () => {
    await database.db.query(
      `update contest_participants set eligibility_status = 'disqualified'
        where contest_id = $1 and pubkey_hash = $2`,
      [contestId, A]
    );
    await leaderboard.rebuild(contestId);

    const view = await leaderboard.top(contestId, 10, 0);
    expect(view.entries.map((entry) => entry.pubkeyHash)).toEqual([B, C]);
  });

  it("falls back to Postgres when Redis is unavailable", async () => {
    // Nothing about a leaderboard read may depend on the cache being up.
    const withoutRedis = new ContestLeaderboard(repository, null, () => {});
    const view = await withoutRedis.top(contestId, 10, 0);

    expect(view.source).toBe("postgres");
    expect(view.entries.map((entry) => entry.pubkeyHash)).toEqual([A, B, C]);
  });

  it("answers a participant's own standing from Postgres", async () => {
    const standing = await leaderboard.standing(contestId, B);
    expect(standing.rank).toBe(2);
    // 18,420 − 17,980 + 1 to pass, not merely draw.
    expect(standing.pointsToNextRank).toBe(441);

    const leader = await leaderboard.standing(contestId, A);
    expect(leader.rank).toBe(1);
    expect(leader.pointsToNextRank).toBeNull();
  });

  it("reports no standing for an identity that never joined", async () => {
    const standing = await leaderboard.standing(contestId, "f".repeat(64));
    expect(standing.rank).toBeNull();
    expect(standing.pointsToNextRank).toBeNull();
  });
});
