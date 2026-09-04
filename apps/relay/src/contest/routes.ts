import type { FastifyInstance } from "fastify";
import Stripe from "stripe";

import {
  ContestActivityRequestSchema,
  ContestJoinRequestSchema,
  ContestMeRequestSchema,
  type ContestRules
} from "@nada/types";

import type { RelayEnv } from "../env";
import { verifyIdentityProof } from "../identity-proof";
import { isOriginAllowed } from "../origin";
import type { ContestRecord, ContestRepository } from "./repository";
import { categoryFor, pointsFor } from "./rules";
import { describe } from "./scoring";
import type { ContestService } from "./service";

/**
 * Participant-facing contest API.
 *
 * Reads that reveal nothing personal (the contest, its rules, the public
 * leaderboard) are unauthenticated. Everything that names an identity — your
 * score, your activity, joining — requires an identity proof, because
 * otherwise knowing a pubkey hash would be enough to read someone's contest
 * history or enter them into a paid contest.
 *
 * Nothing a client sends influences a score. The client cannot supply points,
 * a rank, an eligibility flag, a contest status, or a timestamp that scoring
 * depends on; it supplies an authenticated intent and reads back what the
 * server decided.
 */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_WINNER_COUNT = 3;

interface ContestParams {
  contestId: string;
}

/** The public shape of a contest. Never includes fraud internals. */
function publicContest(contest: ContestRecord, rules: ContestRules) {
  return {
    id: contest.id,
    name: contest.name,
    slug: contest.slug,
    description: contest.description,
    status: contest.status,
    startAt: contest.startAtMs,
    endAt: contest.endAtMs,
    registrationStartAt: contest.registrationStartAtMs,
    registrationEndAt: contest.registrationEndAtMs,
    entryFeeMinor: contest.entryFeeMinor,
    entryCurrency: contest.entryCurrency,
    prizeAmountMinor: contest.prizeAmountMinor,
    prizeCurrency: contest.prizeCurrency,
    maxParticipants: contest.maxParticipants,
    rulesVersion: contest.rulesVersion,
    scoring: publicScoring(rules)
  };
}

/**
 * The rules a participant is entitled to see: what earns points and what the
 * limits are. Risk thresholds are omitted — publishing the exact frequency at
 * which the detector fires is publishing the instructions for staying under it.
 */
function publicScoring(rules: ContestRules) {
  const points = Object.entries(rules.points)
    .filter(([, value]) => typeof value === "number" && value > 0)
    .map(([eventType, value]) => ({
      eventType,
      label: describe(eventType as Parameters<typeof describe>[0]),
      points: value as number,
      category: categoryFor(eventType as Parameters<typeof categoryFor>[0])
    }));

  return {
    points,
    caps: {
      dailyPointsPerParticipant: rules.caps.dailyPointsPerParticipant,
      perActorPairPoints: rules.caps.perActorPairPoints,
      actorPairWindowMs: rules.caps.actorPairWindowMs,
      perSourceEntityPoints: rules.caps.perSourceEntityPoints,
      dailyEventsPerType: rules.caps.dailyEventsPerType
    },
    diminishing: rules.diminishing,
    newIdentity: rules.newIdentity,
    challenges: rules.challenges,
    exclusions: rules.exclusions
  };
}

export async function registerContestRoutes(
  app: FastifyInstance,
  env: RelayEnv,
  service: ContestService | null
): Promise<void> {
  if (!service) {
    // No database: the contest engine is not available on this relay. Answer
    // honestly rather than pretending an empty contest list is the truth.
    app.get("/api/v1/contests", async (_request, reply) =>
      reply.code(503).send({
        code: "contest_engine_unavailable",
        message: "The contest engine requires a database."
      })
    );
    return;
  }

  const repository: ContestRepository = service.repository;

  app.get("/api/v1/contests", async (_request, reply) => {
    const contests = await repository.listPublicContests(25);
    const withRules = await Promise.all(
      contests.map(async (contest) => {
        const rules = await service.rulesForContest(contest);
        return publicContest(contest, rules);
      })
    );
    return reply.send({ contests: withRules });
  });

  app.get("/api/v1/contests/metrics", async (request, reply) => {
    // Aggregate-only, and still gated: operational counters are not something
    // a competitor in a prize contest should be able to watch in real time.
    const token = env.contestMetricsToken;
    if (!token) {
      return reply.code(404).send({ code: "not_found", message: "Not found." });
    }
    const header = request.headers.authorization;
    if (header !== `Bearer ${token}`) {
      return reply.code(401).send({ code: "unauthorized", message: "Unauthorized." });
    }
    return reply.send(service.metrics.snapshot());
  });

  app.get<{ Params: ContestParams }>("/api/v1/contests/:contestId", async (request, reply) => {
    const contest = await resolveContest(repository, request.params.contestId);
    if (!contest || contest.status === "DRAFT") {
      return reply.code(404).send({ code: "contest_not_found", message: "Contest not found." });
    }
    const rules = await service.rulesForContest(contest);
    const stats = await repository.stats(contest.id);
    return reply.send({
      contest: publicContest(contest, rules),
      // Participation totals are public; risk internals are not.
      stats: {
        participants: stats.participants,
        activeParticipants: stats.activeParticipants,
        validEvents: stats.validEvents,
        pointsAwarded: stats.pointsAwarded
      }
    });
  });

  app.get<{ Params: ContestParams }>(
    "/api/v1/contests/:contestId/rules",
    async (request, reply) => {
      const contest = await resolveContest(repository, request.params.contestId);
      if (!contest || contest.status === "DRAFT") {
        return reply.code(404).send({ code: "contest_not_found", message: "Contest not found." });
      }
      const rules = await service.rulesForContest(contest);
      return reply.send({
        contestId: contest.id,
        rulesVersion: contest.rulesVersion,
        scoring: publicScoring(rules)
      });
    }
  );

  app.get<{ Params: ContestParams; Querystring: { limit?: string; offset?: string } }>(
    "/api/v1/contests/:contestId/leaderboard",
    async (request, reply) => {
      const contest = await resolveContest(repository, request.params.contestId);
      if (!contest || contest.status === "DRAFT") {
        return reply.code(404).send({ code: "contest_not_found", message: "Contest not found." });
      }
      const limit = clampInt(request.query.limit, 10, 1, 100);
      const offset = clampInt(request.query.offset, 0, 0, 10_000);
      const view = await service.leaderboard.top(contest.id, limit, offset);
      return reply.send({
        contestId: contest.id,
        source: view.source,
        // Anonymous identity only: a display name and the pubkey hash that is
        // already public on every Echo. No institution, no CampOS identity.
        entries: view.entries.map((entry) => ({
          rank: entry.rank,
          pubkeyHash: entry.pubkeyHash,
          displayName: entry.displayName,
          score: entry.score,
          events: entry.events
        }))
      });
    }
  );

  app.post<{ Params: ContestParams }>(
    "/api/v1/contests/:contestId/join",
    async (request, reply) => {
      const parsed = ContestJoinRequestSchema.safeParse(request.body);
      if (!parsed.success || parsed.data.contestId !== request.params.contestId) {
        return reply
          .code(400)
          .send({ code: "invalid_join_request", message: "Invalid join request." });
      }
      const verification = verifyIdentityProof(parsed.data.proof, {
        context: "contest-join",
        binding: parsed.data.contestId
      });
      if (!verification.ok || verification.pubkeyHash !== parsed.data.pubkeyHash) {
        return reply.code(401).send({
          code: "unauthorized",
          message: "Identity proof failed verification.",
          reason: verification.reason
        });
      }

      const contest = await repository.getContest(parsed.data.contestId);
      if (!contest || contest.status === "DRAFT") {
        return reply.code(404).send({ code: "contest_not_found", message: "Contest not found." });
      }

      const now = Date.now();
      const registrationOpen =
        (contest.status === "REGISTRATION_OPEN" || contest.status === "ACTIVE") &&
        (contest.registrationStartAtMs === null || now >= contest.registrationStartAtMs) &&
        (contest.registrationEndAtMs === null || now < contest.registrationEndAtMs) &&
        now < contest.endAtMs;
      if (!registrationOpen) {
        return reply
          .code(409)
          .send({ code: "registration_closed", message: "Registration is closed." });
      }

      const existing = await repository.getParticipant(contest.id, verification.pubkeyHash);
      if (existing?.eligibilityStatus === "disqualified") {
        return reply
          .code(403)
          .send({ code: "disqualified", message: "This identity is disqualified." });
      }

      if (!existing && contest.maxParticipants !== null) {
        const count = await repository.countParticipants(contest.id);
        if (count >= contest.maxParticipants) {
          return reply
            .code(409)
            .send({ code: "contest_full", message: "This contest is full." });
        }
      }

      const paid = contest.entryFeeMinor > 0;
      const participant = await repository.upsertParticipant({
        contestId: contest.id,
        pubkeyHash: verification.pubkeyHash,
        displayName: parsed.data.displayName,
        paymentStatus: existing?.paymentStatus ?? (paid ? "pending" : "not_required"),
        eligibilityStatus:
          existing?.eligibilityStatus ??
          (paid ? "pending_payment" : "eligible")
      });
      service.invalidateParticipant(contest.id, verification.pubkeyHash);

      if (!paid || participant.paymentStatus === "paid") {
        return reply.send({
          joined: true,
          requiresPayment: false,
          checkoutUrl: null,
          participant: participantView(participant)
        });
      }

      // Paid entry: hand back a Stripe Checkout URL. Eligibility is *not*
      // granted here — it is granted by the webhook, server-side, after Stripe
      // says the money moved. A client that fakes the success redirect gets a
      // participant row that still cannot score.
      if (!env.stripeSecretKey) {
        return reply.code(503).send({
          code: "payments_not_configured",
          message: "Paid entry is not configured on this relay."
        });
      }
      const successUrl = safeRedirect(parsed.data.successUrl, env);
      const cancelUrl = safeRedirect(parsed.data.cancelUrl, env);
      if (!successUrl || !cancelUrl) {
        return reply.code(400).send({
          code: "invalid_redirect",
          message: "Return URLs must point at this deployment."
        });
      }

      const stripe = new Stripe(env.stripeSecretKey);
      let session;
      try {
        session = await stripe.checkout.sessions.create({
          mode: "payment",
          client_reference_id: verification.pubkeyHash,
          success_url: successUrl,
          cancel_url: cancelUrl,
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: contest.entryCurrency.toLowerCase(),
                unit_amount: contest.entryFeeMinor,
                product_data: { name: `${contest.name} — entry` }
              }
            }
          ],
          metadata: {
            contest_id: contest.id,
            pubkey_hash: verification.pubkeyHash,
            kind: "contest_entry"
          }
        });
      } catch (err) {
        app.log.error({ err }, "Contest entry checkout failed");
        return reply
          .code(502)
          .send({ code: "checkout_failed", message: "Could not start checkout." });
      }

      await repository.createEntryPayment({
        contestId: contest.id,
        pubkeyHash: verification.pubkeyHash,
        providerSessionId: session.id,
        amountMinor: contest.entryFeeMinor,
        currency: contest.entryCurrency
      });

      return reply.send({
        joined: true,
        requiresPayment: true,
        checkoutUrl: session.url,
        participant: participantView(participant)
      });
    }
  );

  app.post<{ Params: ContestParams }>(
    "/api/v1/contests/:contestId/me",
    async (request, reply) => {
      const parsed = ContestMeRequestSchema.safeParse(request.body);
      if (!parsed.success || parsed.data.contestId !== request.params.contestId) {
        return reply.code(400).send({ code: "invalid_request", message: "Invalid request." });
      }
      const verification = verifyIdentityProof(parsed.data.proof, {
        context: "contest-me",
        binding: parsed.data.contestId
      });
      if (!verification.ok || verification.pubkeyHash !== parsed.data.pubkeyHash) {
        return reply
          .code(401)
          .send({ code: "unauthorized", message: "Identity proof failed verification." });
      }

      const contest = await repository.getContest(parsed.data.contestId);
      if (!contest) {
        return reply.code(404).send({ code: "contest_not_found", message: "Contest not found." });
      }
      const participant = await repository.getParticipant(contest.id, verification.pubkeyHash);
      if (!participant) {
        return reply.send({ joined: false });
      }

      const [standing, breakdown, ledgerScore, weekPoints] = await Promise.all([
        service.leaderboard.standing(contest.id, verification.pubkeyHash),
        repository.scoreBreakdown(contest.id, verification.pubkeyHash),
        repository.reconstructScore(contest.id, verification.pubkeyHash),
        repository.pointsInWindow(contest.id, verification.pubkeyHash, Date.now() - WEEK_MS)
      ]);

      return reply.send({
        joined: true,
        participant: participantView(participant),
        rank: standing.rank,
        pointsToNextRank: standing.pointsToNextRank,
        // Shown from the ledger, not the cache, so the number a participant
        // sees is the number that can be explained line by line.
        score: ledgerScore,
        thisWeek: weekPoints,
        breakdown
      });
    }
  );

  app.post<{ Params: ContestParams }>(
    "/api/v1/contests/:contestId/me/activity",
    async (request, reply) => {
      const parsed = ContestActivityRequestSchema.safeParse(request.body);
      if (!parsed.success || parsed.data.contestId !== request.params.contestId) {
        return reply.code(400).send({ code: "invalid_request", message: "Invalid request." });
      }
      const verification = verifyIdentityProof(parsed.data.proof, {
        context: "contest-activity",
        binding: parsed.data.contestId
      });
      if (!verification.ok || verification.pubkeyHash !== parsed.data.pubkeyHash) {
        return reply
          .code(401)
          .send({ code: "unauthorized", message: "Identity proof failed verification." });
      }

      const events = await repository.listEvents(parsed.data.contestId, {
        participantPubkeyHash: verification.pubkeyHash,
        limit: parsed.data.limit,
        before: parsed.data.before
      });

      return reply.send({
        events: events.map((event) => ({
          id: event.id,
          eventType: event.eventType,
          label: describe(event.eventType),
          category: categoryFor(event.eventType),
          points: event.qualificationStatus === "VALID" ? event.pointsAwarded : 0,
          status: event.qualificationStatus,
          // Why an event scored less than face value is the participant's
          // business. *How the detector reached that conclusion* is not: risk
          // scores and evidence stay on the admin side.
          reason: event.rejectionReason,
          sourceEntityType: event.sourceEntityType,
          sourceEntityId: event.sourceEntityId,
          occurredAt: event.occurredAtMs
        }))
      });
    }
  );
}

function participantView(participant: {
  displayName: string;
  joinedAtMs: number;
  paymentStatus: string;
  eligibilityStatus: string;
  currentScore: number;
  finalScore: number | null;
  finalRank: number | null;
}) {
  return {
    displayName: participant.displayName,
    joinedAt: participant.joinedAtMs,
    paymentStatus: participant.paymentStatus,
    eligibilityStatus: participant.eligibilityStatus,
    score: participant.currentScore,
    finalScore: participant.finalScore,
    finalRank: participant.finalRank
  };
}

/** Accepts a contest id or its slug, so shareable URLs can use either. */
async function resolveContest(
  repository: ContestRepository,
  idOrSlug: string
): Promise<ContestRecord | null> {
  const byId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug)
    ? await repository.getContest(idOrSlug)
    : null;
  return byId ?? repository.getContestBySlug(idOrSlug);
}

function clampInt(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

/**
 * Stripe will redirect a browser to whatever we hand it, so an unvalidated
 * client-supplied return URL is an open redirect with a payment flow attached.
 * Only origins this relay already trusts are accepted.
 */
function safeRedirect(raw: string | undefined, env: RelayEnv): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return isOriginAllowed(url.origin, env.allowedOrigin) ? url.toString() : null;
  } catch {
    return null;
  }
}

export { DEFAULT_WINNER_COUNT, publicScoring, pointsFor };
