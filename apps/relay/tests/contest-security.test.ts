import fastify, { type FastifyInstance } from "fastify";
import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { registerContestAdminRoutes } from "../src/contest/admin-routes";
import { ContestRepository } from "../src/contest/repository";
import { registerContestRoutes } from "../src/contest/routes";
import { defaultRules } from "../src/contest/rules";
import { ContestService } from "../src/contest/service";
import type { RelayEnv } from "../src/env";
import { buildSignedMessage, derivePubkeyHash } from "../src/identity-proof";
import {
  HAS_POSTGRES,
  createTestDatabase,
  silentLogger,
  type TestDatabase
} from "./helpers/contest-db";

/**
 * The contest API treated as hostile input.
 *
 * A leaderboard with money attached is worth attacking, and every one of these
 * is an attack somebody will actually try: claim someone else's score, post
 * your own points, replay a captured proof, reach an admin action with an
 * ordinary key. The server has to decide identity, validity, scoring,
 * eligibility, status and ranking — the client decides none of them.
 */

interface Identity {
  privateKey: KeyObject;
  pubkey: string;
  pubkeyHash: string;
}

function newIdentity(): Identity {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const spki = publicKey.export({ format: "der", type: "spki" }) as Buffer;
  const pubkey = spki.subarray(spki.length - 32).toString("base64");
  return { privateKey, pubkey, pubkeyHash: derivePubkeyHash(pubkey) };
}

function proofFor(
  identity: Identity,
  context: string,
  binding?: string,
  timestamp = Date.now()
): Record<string, unknown> {
  const message = buildSignedMessage(context, timestamp, identity.pubkeyHash, binding);
  return {
    pubkey: identity.pubkey,
    pubkeyHash: identity.pubkeyHash,
    signature: sign(null, Buffer.from(message, "utf8"), identity.privateKey).toString(
      "base64"
    ),
    timestamp
  };
}

describe.skipIf(!HAS_POSTGRES)("contest API security", () => {
  let database: TestDatabase;
  let app: FastifyInstance;
  let repository: ContestRepository;
  let service: ContestService;
  let contestId: string;

  const admin = newIdentity();
  const player = newIdentity();
  const stranger = newIdentity();

  const env = {
    allowedOrigin: "https://nada.test",
    contestAdminPubkeyHashes: [admin.pubkeyHash],
    contestMetricsToken: "metrics-token-0123456789",
    stripeSecretKey: undefined
  } as unknown as RelayEnv;

  beforeAll(async () => {
    database = await createTestDatabase();
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await database?.drop();
  });

  beforeEach(async () => {
    await app?.close();
    await database.db.query("delete from contests");
    repository = new ContestRepository(database.db);
    service = new ContestService(database.db, null, silentLogger);
    app = fastify();
    await registerContestRoutes(app, env, service);
    await registerContestAdminRoutes(app, env, service);

    const contest = await repository.createContest({
      name: "Security League",
      slug: `security-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      description: "",
      startAtMs: Date.now() - 86_400_000,
      endAtMs: Date.now() + 86_400_000,
      entryFeeMinor: 0,
      entryCurrency: "NGN",
      prizeAmountMinor: 3_000_000,
      prizeCurrency: "NGN",
      rules: defaultRules(),
      createdBy: admin.pubkeyHash
    });
    contestId = contest.id;
    await database.db.query(
      "update contests set status = 'ACTIVE', published_at = now() where id = $1",
      [contestId]
    );
    service.invalidateContests();
  });

  const join = (body: Record<string, unknown>) =>
    app.inject({ method: "POST", url: `/api/v1/contests/${contestId}/join`, payload: body });

  it("refuses a join with no proof at all", async () => {
    const response = await join({
      contestId,
      pubkeyHash: player.pubkeyHash,
      displayName: "Ghost"
    });
    expect(response.statusCode).toBe(400);
  });

  it("refuses a join whose proof belongs to someone else", async () => {
    // The classic: sign with your own key, claim to be another identity.
    const response = await join({
      contestId,
      pubkeyHash: stranger.pubkeyHash,
      displayName: "Ghost",
      proof: proofFor(player, "contest-join", contestId)
    });
    expect(response.statusCode).toBe(401);
  });

  it("refuses a proof signed for a different contest", async () => {
    const other = await repository.createContest({
      name: "Other",
      slug: `other-${Date.now()}`,
      description: "",
      startAtMs: Date.now() - 1000,
      endAtMs: Date.now() + 86_400_000,
      entryFeeMinor: 0,
      entryCurrency: "NGN",
      prizeAmountMinor: 0,
      prizeCurrency: "NGN",
      rules: defaultRules(),
      createdBy: admin.pubkeyHash
    });
    const response = await join({
      contestId,
      pubkeyHash: player.pubkeyHash,
      displayName: "Ghost",
      proof: proofFor(player, "contest-join", other.id)
    });
    expect(response.statusCode).toBe(401);
  });

  it("refuses a proof captured and replayed later", async () => {
    const stale = proofFor(player, "contest-join", contestId, Date.now() - 120_000);
    const response = await join({
      contestId,
      pubkeyHash: player.pubkeyHash,
      displayName: "Ghost",
      proof: stale
    });
    expect(response.statusCode).toBe(401);
  });

  it("refuses a proof signed for a different purpose", async () => {
    // A proof harvested from an ordinary Whisper write must not open a contest
    // action — that is what the context tag is for.
    const response = await join({
      contestId,
      pubkeyHash: player.pubkeyHash,
      displayName: "Ghost",
      proof: proofFor(player, "whisper-publish", contestId)
    });
    expect(response.statusCode).toBe(401);
  });

  it("ignores points, rank and eligibility a client tries to post", async () => {
    const response = await join({
      contestId,
      pubkeyHash: player.pubkeyHash,
      displayName: "Ghost",
      // None of these are part of the schema, and none of them may take effect.
      points: 100_000,
      score: 100_000,
      rank: 1,
      currentScore: 999,
      eligibilityStatus: "eligible",
      finalRank: 1,
      proof: proofFor(player, "contest-join", contestId)
    });
    expect(response.statusCode).toBe(200);

    const participant = await repository.getParticipant(contestId, player.pubkeyHash);
    expect(participant?.currentScore).toBe(0);
    expect(participant?.finalRank).toBeNull();
    expect(await repository.reconstructScore(contestId, player.pubkeyHash)).toBe(0);
  });

  it("refuses to read another identity's contest state", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/contests/${contestId}/me`,
      payload: {
        contestId,
        pubkeyHash: stranger.pubkeyHash,
        proof: proofFor(player, "contest-me", contestId)
      }
    });
    expect(response.statusCode).toBe(401);
  });

  it("refuses to read another identity's activity", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/contests/${contestId}/me/activity`,
      payload: {
        contestId,
        pubkeyHash: stranger.pubkeyHash,
        limit: 10,
        proof: proofFor(player, "contest-activity", contestId)
      }
    });
    expect(response.statusCode).toBe(401);
  });

  it("keeps fraud internals out of the public leaderboard", async () => {
    await repository.upsertParticipant({
      contestId,
      pubkeyHash: player.pubkeyHash,
      displayName: "Ghost_82",
      paymentStatus: "not_required",
      eligibilityStatus: "eligible"
    });
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/contests/${contestId}/leaderboard`
    });
    expect(response.statusCode).toBe(200);
    const body = response.body;
    for (const forbidden of [
      "riskScore",
      "risk_status",
      "riskStatus",
      "evidence",
      "paymentStatus",
      "eligibilityStatus",
      "institution"
    ]) {
      expect(body).not.toContain(forbidden);
    }
  });

  it("keeps the fraud detector's thresholds out of the published rules", async () => {
    // Publishing the exact rate a detector fires at is publishing how to stay
    // under it.
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/contests/${contestId}/rules`
    });
    expect(response.statusCode).toBe(200);
    for (const forbidden of [
      "rapidInteractionPerMinute",
      "automationJitterMs",
      "clusterDominanceRatio",
      "holdForReviewAt",
      "weights"
    ]) {
      expect(response.body).not.toContain(forbidden);
    }
  });

  it("refuses an admin action from an identity that is not allow-listed", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/contests/admin/${contestId}/freeze`,
      payload: {
        contestId,
        pubkeyHash: player.pubkeyHash,
        reason: "mine now",
        proof: proofFor(player, "contest-admin", `freeze:${contestId}`)
      }
    });
    expect(response.statusCode).toBe(401);
    const contest = await repository.getContest(contestId);
    expect(contest?.status).toBe("ACTIVE");
  });

  it("refuses an admin proof bound to a different action", async () => {
    // An operator's proof for "overview" must not be replayable as "finalize".
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/contests/admin/${contestId}/freeze`,
      payload: {
        contestId,
        pubkeyHash: admin.pubkeyHash,
        reason: "replayed",
        proof: proofFor(admin, "contest-admin", `overview:${contestId}`)
      }
    });
    expect(response.statusCode).toBe(401);
    expect((await repository.getContest(contestId))?.status).toBe("ACTIVE");
  });

  it("refuses an admin proof bound to a different contest", async () => {
    const other = await repository.createContest({
      name: "Other",
      slug: `other2-${Date.now()}`,
      description: "",
      startAtMs: Date.now() - 1000,
      endAtMs: Date.now() + 86_400_000,
      entryFeeMinor: 0,
      entryCurrency: "NGN",
      prizeAmountMinor: 0,
      prizeCurrency: "NGN",
      rules: defaultRules(),
      createdBy: admin.pubkeyHash
    });
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/contests/admin/${contestId}/freeze`,
      payload: {
        contestId,
        pubkeyHash: admin.pubkeyHash,
        reason: "wrong contest",
        proof: proofFor(admin, "contest-admin", `freeze:${other.id}`)
      }
    });
    expect(response.statusCode).toBe(401);
  });

  it("accepts the allow-listed admin and records the change", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/contests/admin/${contestId}/freeze`,
      payload: {
        contestId,
        pubkeyHash: admin.pubkeyHash,
        reason: "contest ended",
        proof: proofFor(admin, "contest-admin", `freeze:${contestId}`)
      }
    });
    expect(response.statusCode).toBe(200);
    expect((await repository.getContest(contestId))?.status).toBe("FROZEN");

    const audit = await repository.listAudit(contestId, 10, 0);
    expect(audit[0]?.action).toBe("CONTEST_FROZEN");
    expect(audit[0]?.actorPubkeyHash).toBe(admin.pubkeyHash);
  });

  it("refuses an illegal status transition even from a real admin", async () => {
    // The state machine is a server invariant, not a UI convention.
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/contests/admin/${contestId}/finalize`,
      payload: {
        contestId,
        pubkeyHash: admin.pubkeyHash,
        reason: "skip the review",
        proof: proofFor(admin, "contest-admin", `finalize:${contestId}`)
      }
    });
    expect(response.statusCode).toBe(409);
    expect((await repository.getContest(contestId))?.status).toBe("ACTIVE");
  });

  it("hides operational metrics behind their token", async () => {
    const anonymous = await app.inject({
      method: "GET",
      url: "/api/v1/contests/metrics"
    });
    expect(anonymous.statusCode).toBe(401);

    const wrong = await app.inject({
      method: "GET",
      url: "/api/v1/contests/metrics",
      headers: { authorization: "Bearer nope" }
    });
    expect(wrong.statusCode).toBe(401);

    const right = await app.inject({
      method: "GET",
      url: "/api/v1/contests/metrics",
      headers: { authorization: "Bearer metrics-token-0123456789" }
    });
    expect(right.statusCode).toBe(200);
    expect(right.json()).toHaveProperty("contest_events_processed_total");
  });

  it("refuses to join a contest that is not accepting entries", async () => {
    await database.db.query("update contests set status = 'FROZEN' where id = $1", [
      contestId
    ]);
    const response = await join({
      contestId,
      pubkeyHash: player.pubkeyHash,
      displayName: "Ghost",
      proof: proofFor(player, "contest-join", contestId)
    });
    expect(response.statusCode).toBe(409);
  });

  it("does not leak whether an identity is an administrator", async () => {
    // An unauthorised admin call and an unknown-identity admin call must be
    // indistinguishable, or the endpoint becomes an admin-key oracle.
    const notAdmin = await app.inject({
      method: "POST",
      url: "/api/v1/contests/admin/whoami",
      payload: {
        pubkeyHash: player.pubkeyHash,
        proof: proofFor(player, "contest-admin", "whoami:global")
      }
    });
    const badProof = await app.inject({
      method: "POST",
      url: "/api/v1/contests/admin/whoami",
      payload: {
        pubkeyHash: admin.pubkeyHash,
        proof: proofFor(admin, "contest-admin", "wrong:global")
      }
    });
    expect(notAdmin.statusCode).toBe(401);
    expect(badProof.statusCode).toBe(401);
    expect(notAdmin.json()).toEqual(badProof.json());
  });
});
