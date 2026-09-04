import type { FastifyInstance } from "fastify";

import {
  ContestAdminAuthSchema,
  ContestAdminListRequestSchema,
  ContestCreateRequestSchema,
  ContestParticipantReviewRequestSchema,
  ContestPayoutRequestSchema,
  ContestRulesSchema,
  ContestTransitionRequestSchema,
  ContestUpdateRequestSchema,
  ContestWinnerApproveRequestSchema
} from "@nada/types";

import type { RelayEnv } from "../env";
import { finalizeContest, transitionContest } from "./lifecycle";
import type { ContestRepository } from "./repository";
import { defaultRules } from "./rules";
import { describe } from "./scoring";
import type { ContestService } from "./service";
import { verifyContestAdmin } from "./admin-auth";

/**
 * Administrative contest API.
 *
 * Two rules run through every handler here. First, no silent mutation: every
 * privileged write records an audit row naming the actor, the before and after
 * state, and the reason they gave — in the same transaction as the change
 * wherever the change is transactional. Second, the review surfaces show
 * evidence rather than verdicts, so an admin deciding whether to disqualify
 * somebody is reading the detector's working.
 *
 * What an admin can see is still bounded by NADA's privacy model: anonymous
 * identities, their contest activity, and the risk evidence the engine
 * produced. No CampOS identity mapping, no message content, no institution.
 */

const DEFAULT_WINNER_COUNT = 3;

interface AdminParams {
  contestId: string;
}

export async function registerContestAdminRoutes(
  app: FastifyInstance,
  env: RelayEnv,
  service: ContestService | null
): Promise<void> {
  if (!service) return;
  const repository: ContestRepository = service.repository;

  /** Shared preamble: validate the body, verify the proof, load the contest. */
  const authorize = <T extends { pubkeyHash: string; proof: Parameters<typeof verifyContestAdmin>[1]["proof"] }>(
    body: T,
    action: string,
    contestId: string | null
  ) => verifyContestAdmin(env, body, action, contestId);

  app.post("/api/v1/contests/admin/whoami", async (request, reply) => {
    const parsed = ContestAdminAuthSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ code: "invalid_request", message: "Invalid request." });
    }
    const auth = authorize(parsed.data, "whoami", null);
    if (!auth.ok) {
      return reply.code(401).send({ code: auth.code, message: auth.message });
    }
    return reply.send({ admin: true, pubkeyHash: auth.pubkeyHash });
  });

  app.post("/api/v1/contests/admin/list", async (request, reply) => {
    const parsed = ContestAdminAuthSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ code: "invalid_request", message: "Invalid request." });
    }
    const auth = authorize(parsed.data, "list", null);
    if (!auth.ok) {
      return reply.code(401).send({ code: auth.code, message: auth.message });
    }
    const contests = await repository.listAllContests(100);
    return reply.send({ contests });
  });

  app.post("/api/v1/contests/admin/create", async (request, reply) => {
    const parsed = ContestCreateRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ code: "invalid_contest", message: "Invalid contest definition." });
    }
    const auth = authorize(parsed.data, "create", null);
    if (!auth.ok) {
      return reply.code(401).send({ code: auth.code, message: auth.message });
    }
    if (parsed.data.endAt <= parsed.data.startAt) {
      return reply
        .code(400)
        .send({ code: "invalid_window", message: "A contest must end after it starts." });
    }
    if (
      parsed.data.registrationEndAt !== undefined &&
      parsed.data.registrationStartAt !== undefined &&
      parsed.data.registrationEndAt <= parsed.data.registrationStartAt
    ) {
      return reply.code(400).send({
        code: "invalid_registration_window",
        message: "Registration must close after it opens."
      });
    }

    const existing = await repository.getContestBySlug(parsed.data.slug);
    if (existing) {
      return reply
        .code(409)
        .send({ code: "slug_taken", message: "That slug is already in use." });
    }

    const contest = await repository.createContest({
      name: parsed.data.name,
      slug: parsed.data.slug,
      description: parsed.data.description,
      startAtMs: parsed.data.startAt,
      endAtMs: parsed.data.endAt,
      registrationStartAtMs: parsed.data.registrationStartAt,
      registrationEndAtMs: parsed.data.registrationEndAt,
      entryFeeMinor: parsed.data.entryFeeMinor,
      entryCurrency: parsed.data.entryCurrency,
      prizeAmountMinor: parsed.data.prizeAmountMinor,
      prizeCurrency: parsed.data.prizeCurrency,
      maxParticipants: parsed.data.maxParticipants,
      rules: parsed.data.rules ?? defaultRules(),
      createdBy: auth.pubkeyHash
    });
    await repository.audit({
      contestId: contest.id,
      action: "CONTEST_CREATED",
      actorPubkeyHash: auth.pubkeyHash,
      target: contest.id,
      after: { name: contest.name, slug: contest.slug, status: contest.status }
    });
    service.invalidateContests();
    return reply.send({ contest });
  });

  app.post<{ Params: AdminParams }>(
    "/api/v1/contests/admin/:contestId/update",
    async (request, reply) => {
      const parsed = ContestUpdateRequestSchema.safeParse(request.body);
      if (!parsed.success || parsed.data.contestId !== request.params.contestId) {
        return reply.code(400).send({ code: "invalid_request", message: "Invalid request." });
      }
      const auth = authorize(parsed.data, "update", parsed.data.contestId);
      if (!auth.ok) {
        return reply.code(401).send({ code: auth.code, message: auth.message });
      }
      const before = await repository.getContest(parsed.data.contestId);
      if (!before) {
        return reply
          .code(404)
          .send({ code: "contest_not_found", message: "Contest not found." });
      }
      if (before.status === "FINALIZED" || before.status === "CANCELLED") {
        return reply.code(409).send({
          code: "contest_closed",
          message: "A finalized or cancelled contest cannot be edited."
        });
      }

      const updated = await repository.database.withTransaction(async (tx) => {
        const fields: string[] = [];
        const params: unknown[] = [parsed.data.contestId];
        const push = (column: string, value: unknown, cast = ""): void => {
          params.push(value);
          fields.push(`${column} = $${params.length}${cast}`);
        };
        if (parsed.data.name !== undefined) push("name", parsed.data.name);
        if (parsed.data.description !== undefined) push("description", parsed.data.description);
        if (parsed.data.startAt !== undefined) {
          params.push(parsed.data.startAt);
          fields.push(`start_at = to_timestamp($${params.length}::bigint / 1000.0)`);
        }
        if (parsed.data.endAt !== undefined) {
          params.push(parsed.data.endAt);
          fields.push(`end_at = to_timestamp($${params.length}::bigint / 1000.0)`);
        }
        if (parsed.data.registrationStartAt !== undefined) {
          params.push(parsed.data.registrationStartAt);
          fields.push(`registration_start_at = to_timestamp($${params.length}::bigint / 1000.0)`);
        }
        if (parsed.data.registrationEndAt !== undefined) {
          params.push(parsed.data.registrationEndAt);
          fields.push(`registration_end_at = to_timestamp($${params.length}::bigint / 1000.0)`);
        }
        if (parsed.data.entryFeeMinor !== undefined) {
          push("entry_fee_minor", parsed.data.entryFeeMinor);
        }
        if (parsed.data.entryCurrency !== undefined) {
          push("entry_currency", parsed.data.entryCurrency);
        }
        if (parsed.data.prizeAmountMinor !== undefined) {
          push("prize_amount_minor", parsed.data.prizeAmountMinor);
        }
        if (parsed.data.prizeCurrency !== undefined) {
          push("prize_currency", parsed.data.prizeCurrency);
        }
        if (parsed.data.maxParticipants !== undefined) {
          push("max_participants", parsed.data.maxParticipants);
        }
        if (fields.length > 0) {
          await tx.query(
            `update contests set ${fields.join(", ")}, updated_at = now() where id = $1`,
            params
          );
        }

        // Rules are never edited in place. Supplying them appends the next
        // immutable version, so a participant's past events keep pointing at
        // the rules they were actually scored under.
        let newVersion: number | null = null;
        if (parsed.data.rules) {
          newVersion = await repository.addRuleVersion(
            parsed.data.contestId,
            ContestRulesSchema.parse(parsed.data.rules),
            auth.pubkeyHash,
            parsed.data.reason || "Rules updated",
            tx
          );
        }

        const after = await repository.getContest(parsed.data.contestId, tx);
        await repository.audit(
          {
            contestId: parsed.data.contestId,
            action: newVersion ? "RULES_UPDATED" : "CONTEST_UPDATED",
            actorPubkeyHash: auth.pubkeyHash,
            target: parsed.data.contestId,
            before,
            after: after ? { ...after, newRulesVersion: newVersion } : { newRulesVersion: newVersion },
            reason: parsed.data.reason
          },
          tx
        );
        return after;
      });

      service.invalidateRules();
      return reply.send({ contest: updated });
    }
  );

  /**
   * Registers one lifecycle transition.
   *
   * `proofAction` is what the caller signs and is deliberately the URL's own
   * verb — the thing a client can see. `auditAction` is the name the change is
   * recorded under. Deriving the first from the second (lower-casing
   * "CONTEST_FROZEN") would silently require callers to know the audit
   * vocabulary, which is not part of the API.
   */
  const transitionRoute = (
    proofAction: string,
    to: Parameters<typeof transitionContest>[0]["to"],
    auditAction: string
  ): void => {
    app.post<{ Params: AdminParams }>(
      `/api/v1/contests/admin/:contestId/${proofAction}`,
      async (request, reply) => {
      const parsed = ContestTransitionRequestSchema.safeParse(request.body);
      if (!parsed.success || parsed.data.contestId !== request.params.contestId) {
        return reply.code(400).send({ code: "invalid_request", message: "Invalid request." });
      }
      const auth = authorize(parsed.data, proofAction, parsed.data.contestId);
      if (!auth.ok) {
        return reply.code(401).send({ code: auth.code, message: auth.message });
      }
      const result = await transitionContest({
        repository,
        contestId: parsed.data.contestId,
        to,
        actorPubkeyHash: auth.pubkeyHash,
        action: auditAction,
        reason: parsed.data.reason
      });
      service.invalidateContests();
      if (!result.ok) {
        return reply.code(409).send({ code: result.code, message: result.message });
      }
      app.log.info(
        { contestId: parsed.data.contestId, status: to },
        "Contest status changed"
      );
      return reply.send({ contest: result.contest });
      }
    );
  };

  transitionRoute("publish", "REGISTRATION_OPEN", "CONTEST_PUBLISHED");
  transitionRoute("activate", "ACTIVE", "CONTEST_ACTIVATED");
  transitionRoute("freeze", "FROZEN", "CONTEST_FROZEN");
  transitionRoute("cancel", "CANCELLED", "CONTEST_CANCELLED");

  /**
   * Reconciliation: replay the window, then run the aggregate fraud sweep, then
   * move the contest to UNDER_REVIEW. This is the step that makes finalization
   * defensible, so it is a separate, explicit action rather than something
   * hidden inside freeze.
   */
  app.post<{ Params: AdminParams }>(
    "/api/v1/contests/admin/:contestId/reconcile",
    async (request, reply) => {
      const parsed = ContestTransitionRequestSchema.safeParse(request.body);
      if (!parsed.success || parsed.data.contestId !== request.params.contestId) {
        return reply.code(400).send({ code: "invalid_request", message: "Invalid request." });
      }
      const auth = authorize(parsed.data, "reconcile", parsed.data.contestId);
      if (!auth.ok) {
        return reply.code(401).send({ code: auth.code, message: auth.message });
      }
      const contest = await repository.getContest(parsed.data.contestId);
      if (!contest) {
        return reply
          .code(404)
          .send({ code: "contest_not_found", message: "Contest not found." });
      }
      if (contest.status !== "FROZEN") {
        return reply.code(409).send({
          code: "invalid_transition",
          message: "Reconciliation runs on a frozen contest."
        });
      }

      const reconciled = await service.reconcile(contest.id);
      const flagged = await service.sweepClusterRisk(contest.id);
      await service.leaderboard.rebuild(contest.id);

      const result = await transitionContest({
        repository,
        contestId: contest.id,
        to: "UNDER_REVIEW",
        actorPubkeyHash: auth.pubkeyHash,
        action: "CONTEST_UNDER_REVIEW",
        reason: parsed.data.reason || "Reconciliation complete"
      });
      await repository.audit({
        contestId: contest.id,
        action: "CONTEST_RECONCILED",
        actorPubkeyHash: auth.pubkeyHash,
        target: contest.id,
        after: { ...reconciled, clusterFlags: flagged },
        reason: parsed.data.reason
      });
      service.invalidateContests();
      app.log.info(
        { contestId: contest.id, ...reconciled, clusterFlags: flagged },
        "Contest reconciled"
      );
      return reply.send({
        reconciled,
        clusterFlags: flagged,
        contest: result.contest
      });
    }
  );

  app.post<{ Params: AdminParams }>(
    "/api/v1/contests/admin/:contestId/finalize",
    async (request, reply) => {
      const parsed = ContestTransitionRequestSchema.safeParse(request.body);
      if (!parsed.success || parsed.data.contestId !== request.params.contestId) {
        return reply.code(400).send({ code: "invalid_request", message: "Invalid request." });
      }
      const auth = authorize(parsed.data, "finalize", parsed.data.contestId);
      if (!auth.ok) {
        return reply.code(401).send({ code: auth.code, message: auth.message });
      }
      const contest = await repository.getContest(parsed.data.contestId);
      if (!contest) {
        return reply
          .code(404)
          .send({ code: "contest_not_found", message: "Contest not found." });
      }
      const result = await finalizeContest({
        repository,
        contest,
        actorPubkeyHash: auth.pubkeyHash,
        reason: parsed.data.reason,
        winnerCount: DEFAULT_WINNER_COUNT
      });
      if (!result.ok) {
        return reply.code(409).send({ code: result.code, message: result.message });
      }
      service.invalidateContests();
      await service.leaderboard.rebuild(contest.id);
      const winners = await repository.listWinners(contest.id);
      app.log.info({ contestId: contest.id, winners: winners.length }, "Contest finalized");
      return reply.send({ contest: result.contest, winners });
    }
  );

  app.post<{ Params: AdminParams }>(
    "/api/v1/contests/admin/:contestId/overview",
    async (request, reply) => {
      const parsed = ContestTransitionRequestSchema.safeParse(request.body);
      if (!parsed.success || parsed.data.contestId !== request.params.contestId) {
        return reply.code(400).send({ code: "invalid_request", message: "Invalid request." });
      }
      const auth = authorize(parsed.data, "overview", parsed.data.contestId);
      if (!auth.ok) {
        return reply.code(401).send({ code: auth.code, message: auth.message });
      }
      const contest = await repository.getContest(parsed.data.contestId);
      if (!contest) {
        return reply
          .code(404)
          .send({ code: "contest_not_found", message: "Contest not found." });
      }
      const [stats, winners, ruleVersions] = await Promise.all([
        repository.stats(contest.id),
        repository.listWinners(contest.id),
        repository.listRuleVersions(contest.id)
      ]);
      return reply.send({
        contest,
        stats,
        winners,
        ruleVersions: ruleVersions.map((version) => ({
          version: version.version,
          note: version.note,
          createdAt: version.createdAtMs,
          createdBy: version.createdBy
        })),
        metrics: service.metrics.snapshot()
      });
    }
  );

  app.post<{ Params: AdminParams }>(
    "/api/v1/contests/admin/:contestId/participants",
    async (request, reply) => {
      const parsed = ContestAdminListRequestSchema.safeParse(request.body);
      if (!parsed.success || parsed.data.contestId !== request.params.contestId) {
        return reply.code(400).send({ code: "invalid_request", message: "Invalid request." });
      }
      const auth = authorize(parsed.data, "participants", parsed.data.contestId);
      if (!auth.ok) {
        return reply.code(401).send({ code: auth.code, message: auth.message });
      }
      const participants = await repository.listParticipants(
        parsed.data.contestId,
        parsed.data.limit,
        parsed.data.offset
      );
      return reply.send({ participants });
    }
  );

  app.post<{ Params: AdminParams }>(
    "/api/v1/contests/admin/:contestId/participant",
    async (request, reply) => {
      // The review schema minus the fields that describe a mutation: reading a
      // participant's file is not a review action.
      const parsed = ContestParticipantReviewRequestSchema.omit({
        action: true,
        reason: true
      }).safeParse(request.body);
      if (!parsed.success || parsed.data.contestId !== request.params.contestId) {
        return reply.code(400).send({ code: "invalid_request", message: "Invalid request." });
      }
      const auth = authorize(parsed.data, "participant", parsed.data.contestId);
      if (!auth.ok) {
        return reply.code(401).send({ code: auth.code, message: auth.message });
      }

      const target = parsed.data.participantPubkeyHash;
      const [participant, breakdown, ledgerScore, events, risk, ledger] = await Promise.all([
        repository.getParticipant(parsed.data.contestId, target),
        repository.scoreBreakdown(parsed.data.contestId, target),
        repository.reconstructScore(parsed.data.contestId, target),
        repository.listEvents(parsed.data.contestId, {
          participantPubkeyHash: target,
          limit: 200
        }),
        repository.listRiskEvents(parsed.data.contestId, {
          participantPubkeyHash: target,
          limit: 100,
          offset: 0
        }),
        repository.listLedger(parsed.data.contestId, target, 200)
      ]);
      if (!participant) {
        return reply
          .code(404)
          .send({ code: "participant_not_found", message: "Participant not found." });
      }
      return reply.send({
        participant,
        // The cached score and the ledger's own total, side by side. If they
        // ever disagree, the ledger is right and that is a bug worth seeing.
        cachedScore: participant.currentScore,
        ledgerScore,
        breakdown,
        events: events.map((event) => ({
          ...event,
          label: describe(event.eventType)
        })),
        risk,
        ledger
      });
    }
  );

  app.post<{ Params: AdminParams }>(
    "/api/v1/contests/admin/:contestId/events",
    async (request, reply) => {
      const parsed = ContestAdminListRequestSchema.safeParse(request.body);
      if (!parsed.success || parsed.data.contestId !== request.params.contestId) {
        return reply.code(400).send({ code: "invalid_request", message: "Invalid request." });
      }
      const auth = authorize(parsed.data, "events", parsed.data.contestId);
      if (!auth.ok) {
        return reply.code(401).send({ code: auth.code, message: auth.message });
      }
      const events = await repository.listEvents(parsed.data.contestId, {
        limit: parsed.data.limit
      });
      return reply.send({
        events: events.map((event) => ({ ...event, label: describe(event.eventType) }))
      });
    }
  );

  app.post<{ Params: AdminParams }>(
    "/api/v1/contests/admin/:contestId/risk",
    async (request, reply) => {
      const parsed = ContestAdminListRequestSchema.safeParse(request.body);
      if (!parsed.success || parsed.data.contestId !== request.params.contestId) {
        return reply.code(400).send({ code: "invalid_request", message: "Invalid request." });
      }
      const auth = authorize(parsed.data, "risk", parsed.data.contestId);
      if (!auth.ok) {
        return reply.code(401).send({ code: auth.code, message: auth.message });
      }
      const risk = await repository.listRiskEvents(parsed.data.contestId, {
        limit: parsed.data.limit,
        offset: parsed.data.offset
      });
      return reply.send({ risk });
    }
  );

  app.post<{ Params: AdminParams }>(
    "/api/v1/contests/admin/:contestId/review",
    async (request, reply) => {
      const parsed = ContestParticipantReviewRequestSchema.safeParse(request.body);
      if (!parsed.success || parsed.data.contestId !== request.params.contestId) {
        return reply.code(400).send({ code: "invalid_request", message: "Invalid request." });
      }
      const auth = authorize(parsed.data, "review", parsed.data.contestId);
      if (!auth.ok) {
        return reply.code(401).send({ code: auth.code, message: auth.message });
      }
      const { contestId, participantPubkeyHash: target, action, reason } = parsed.data;
      const before = await repository.getParticipant(contestId, target);
      if (!before) {
        return reply
          .code(404)
          .send({ code: "participant_not_found", message: "Participant not found." });
      }

      let reversed = 0;
      let released = 0;
      await repository.database.withTransaction(async (tx) => {
        if (action === "clear") {
          await repository.resolveRiskEvents(contestId, target, auth.pubkeyHash, reason, tx);
          await repository.setParticipantRisk(contestId, target, 0, "LOW", tx);
        } else if (action === "flag") {
          await repository.recordRiskEvent(
            {
              contestId,
              participantPubkeyHash: target,
              actorPubkeyHash: null,
              eventId: null,
              riskType: "DUPLICATE_BEHAVIOR",
              severity: "HIGH",
              score: 40,
              evidence: { manual: true, reason },
              dedupeKey: `manual:${Date.now()}`
            },
            tx
          );
          const score = await repository.cumulativeRisk(contestId, target, tx);
          await repository.setParticipantRisk(
            contestId,
            target,
            score,
            score >= 81 ? "HIGH_RISK" : score >= 51 ? "SUSPICIOUS" : "WATCH",
            tx
          );
        } else if (action === "disqualify") {
          await repository.disqualifyParticipant(contestId, target, reason, tx);
        } else if (action === "reinstate") {
          await repository.reinstateParticipant(contestId, target, tx);
        }

        await repository.audit(
          {
            contestId,
            action: auditActionFor(action),
            actorPubkeyHash: auth.pubkeyHash,
            target,
            before,
            after: { action },
            reason
          },
          tx
        );
      });

      // Reversal and release run outside the transaction above: each walks a
      // page of events and commits per event, so a large participant does not
      // hold one long write transaction open.
      if (action === "disqualify") {
        reversed = await service.reverseParticipantEvents(
          contestId,
          target,
          `Disqualified: ${reason}`,
          auth.pubkeyHash
        );
        await repository.audit({
          contestId,
          action: "POINTS_REVERSED",
          actorPubkeyHash: auth.pubkeyHash,
          target,
          after: { reversedEvents: reversed },
          reason
        });
      }
      if (action === "release_held_events") {
        released = await service.releaseHeldEvents(contestId, target);
      }

      service.invalidateParticipant(contestId, target);
      const after = await repository.getParticipant(contestId, target);
      app.log.info({ contestId, action, reversed, released }, "Contest participant reviewed");
      return reply.send({ participant: after, reversed, released });
    }
  );

  app.post<{ Params: AdminParams }>(
    "/api/v1/contests/admin/:contestId/winner/approve",
    async (request, reply) => {
      const parsed = ContestWinnerApproveRequestSchema.safeParse(request.body);
      if (!parsed.success || parsed.data.contestId !== request.params.contestId) {
        return reply.code(400).send({ code: "invalid_request", message: "Invalid request." });
      }
      const auth = authorize(parsed.data, "winner-approve", parsed.data.contestId);
      if (!auth.ok) {
        return reply.code(401).send({ code: auth.code, message: auth.message });
      }
      const contest = await repository.getContest(parsed.data.contestId);
      if (!contest) {
        return reply
          .code(404)
          .send({ code: "contest_not_found", message: "Contest not found." });
      }
      if (contest.status !== "FINALIZED") {
        return reply.code(409).send({
          code: "not_finalized",
          message: "Winners can only be approved once the contest is finalized."
        });
      }

      const decision = parsed.data.decision === "approve" ? "APPROVED" : "REJECTED";
      const updated = await repository.database.withTransaction(async (tx) => {
        const rows = await repository.setWinnerReview(
          parsed.data.contestId,
          parsed.data.participantPubkeyHash,
          decision,
          auth.pubkeyHash,
          tx
        );
        if (rows > 0) {
          await repository.audit(
            {
              contestId: parsed.data.contestId,
              action: decision === "APPROVED" ? "WINNER_APPROVED" : "WINNER_REJECTED",
              actorPubkeyHash: auth.pubkeyHash,
              target: parsed.data.participantPubkeyHash,
              after: { reviewStatus: decision },
              reason: parsed.data.reason
            },
            tx
          );
        }
        return rows;
      });
      if (updated === 0) {
        return reply
          .code(404)
          .send({ code: "winner_not_found", message: "No winner row for that identity." });
      }
      app.log.info(
        { contestId: parsed.data.contestId, decision },
        "Contest winner reviewed"
      );
      return reply.send({ winners: await repository.listWinners(parsed.data.contestId) });
    }
  );

  app.post<{ Params: AdminParams }>(
    "/api/v1/contests/admin/:contestId/payout",
    async (request, reply) => {
      const parsed = ContestPayoutRequestSchema.safeParse(request.body);
      if (!parsed.success || parsed.data.contestId !== request.params.contestId) {
        return reply.code(400).send({ code: "invalid_request", message: "Invalid request." });
      }
      const auth = authorize(parsed.data, "payout", parsed.data.contestId);
      if (!auth.ok) {
        return reply.code(401).send({ code: auth.code, message: auth.message });
      }

      // A payout is recorded, never initiated here. NADA holds no payout rail,
      // and inventing one would be a worse answer than a durable record of the
      // transfer an operator actually made.
      const updated = await repository.database.withTransaction(async (tx) => {
        const rows = await repository.setWinnerPayout(
          parsed.data.contestId,
          parsed.data.participantPubkeyHash,
          parsed.data.payoutStatus,
          parsed.data.payoutReference,
          parsed.data.note,
          tx
        );
        if (rows > 0) {
          await repository.audit(
            {
              contestId: parsed.data.contestId,
              action: "PAYOUT_RECORDED",
              actorPubkeyHash: auth.pubkeyHash,
              target: parsed.data.participantPubkeyHash,
              after: {
                payoutStatus: parsed.data.payoutStatus,
                payoutReference: parsed.data.payoutReference
              },
              reason: parsed.data.note
            },
            tx
          );
        }
        return rows;
      });
      if (updated === 0) {
        return reply.code(409).send({
          code: "payout_not_allowed",
          message: "Only an approved winner can have a payout recorded."
        });
      }
      service.metrics.payoutRecorded(parsed.data.payoutStatus);
      app.log.info(
        { contestId: parsed.data.contestId, status: parsed.data.payoutStatus },
        "Contest payout recorded"
      );
      return reply.send({ winners: await repository.listWinners(parsed.data.contestId) });
    }
  );

  app.post<{ Params: AdminParams }>(
    "/api/v1/contests/admin/:contestId/audit",
    async (request, reply) => {
      const parsed = ContestAdminListRequestSchema.safeParse(request.body);
      if (!parsed.success || parsed.data.contestId !== request.params.contestId) {
        return reply.code(400).send({ code: "invalid_request", message: "Invalid request." });
      }
      const auth = authorize(parsed.data, "audit", parsed.data.contestId);
      if (!auth.ok) {
        return reply.code(401).send({ code: auth.code, message: auth.message });
      }
      const entries = await repository.listAudit(
        parsed.data.contestId,
        parsed.data.limit,
        parsed.data.offset
      );
      return reply.send({ audit: entries });
    }
  );
}

function auditActionFor(action: string): string {
  switch (action) {
    case "clear":
      return "PARTICIPANT_CLEARED";
    case "flag":
      return "PARTICIPANT_FLAGGED";
    case "disqualify":
      return "PARTICIPANT_DISQUALIFIED";
    case "reinstate":
      return "PARTICIPANT_REINSTATED";
    default:
      return "PARTICIPANT_EVENTS_RELEASED";
  }
}
