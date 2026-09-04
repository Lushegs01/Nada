import type { ContestStatus } from "@nada/types";

import type { ContestRepository, ContestRecord } from "./repository";

/**
 * The contest state machine.
 *
 * The point of the FROZEN → UNDER_REVIEW detour is that nobody is declared a
 * winner because a timer hit zero. Freezing stops scoring; reconciliation
 * replays the window so the ledger is complete; the fraud sweep looks for the
 * collusion that is only visible in aggregate; and only then can a human
 * finalize. Skipping straight from ACTIVE to FINALIZED is not offered, because
 * a prize paid on unreviewed numbers is a prize paid on the leaderboard's word
 * alone.
 */
export const ALLOWED_TRANSITIONS: Readonly<Record<ContestStatus, readonly ContestStatus[]>> = {
  DRAFT: ["REGISTRATION_OPEN", "CANCELLED"],
  REGISTRATION_OPEN: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["FROZEN", "CANCELLED"],
  FROZEN: ["UNDER_REVIEW", "CANCELLED"],
  // Back to FROZEN so a review that turns up a problem can re-run
  // reconciliation and the fraud sweep rather than finalizing regardless.
  UNDER_REVIEW: ["FINALIZED", "FROZEN", "CANCELLED"],
  FINALIZED: [],
  CANCELLED: []
};

export function canTransition(from: ContestStatus, to: ContestStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

const STAMP_COLUMN: Partial<
  Record<ContestStatus, "published_at" | "frozen_at" | "finalized_at" | "cancelled_at">
> = {
  REGISTRATION_OPEN: "published_at",
  FROZEN: "frozen_at",
  FINALIZED: "finalized_at",
  CANCELLED: "cancelled_at"
};

export interface TransitionResult {
  ok: boolean;
  code?: string;
  message?: string;
  contest?: ContestRecord;
}

/**
 * Moves a contest to `to`, recording the change and its reason in the same
 * transaction. Re-reads the contest under a row lock first, so two admins
 * clicking Freeze at once produce one transition and one audit row.
 */
export async function transitionContest(args: {
  repository: ContestRepository;
  contestId: string;
  to: ContestStatus;
  actorPubkeyHash: string;
  action: string;
  reason: string;
}): Promise<TransitionResult> {
  const { repository, contestId, to, actorPubkeyHash, action, reason } = args;

  return repository.database.withTransaction(async (tx) => {
    const locked = await tx.query<{ status: string }>(
      "select status from contests where id = $1 for update",
      [contestId]
    );
    const current = locked.rows[0]?.status as ContestStatus | undefined;
    if (!current) {
      return { ok: false, code: "contest_not_found", message: "Contest not found." };
    }
    if (current === to) {
      const contest = await repository.getContest(contestId, tx);
      return contest ? { ok: true, contest } : { ok: true };
    }
    if (!canTransition(current, to)) {
      return {
        ok: false,
        code: "invalid_transition",
        message: `A contest cannot move from ${current} to ${to}.`
      };
    }

    await repository.setStatus(contestId, to, STAMP_COLUMN[to] ?? null, tx);
    await repository.audit(
      {
        contestId,
        action,
        actorPubkeyHash,
        target: contestId,
        before: { status: current },
        after: { status: to },
        reason
      },
      tx
    );
    const contest = await repository.getContest(contestId, tx);
    return contest ? { ok: true, contest } : { ok: true };
  });
}

/**
 * Finalizes standings and stages winners, all inside one transaction so a
 * partially finalized contest cannot exist.
 *
 * Final scores are recomputed from the ledger rather than read from the cached
 * `current_score`, which is the difference between "the number we have been
 * showing" and "the number we can defend".
 */
export async function finalizeContest(args: {
  repository: ContestRepository;
  contest: ContestRecord;
  actorPubkeyHash: string;
  reason: string;
  winnerCount: number;
}): Promise<TransitionResult> {
  const { repository, contest, actorPubkeyHash, reason, winnerCount } = args;

  return repository.database.withTransaction(async (tx) => {
    const locked = await tx.query<{ status: string }>(
      "select status from contests where id = $1 for update",
      [contest.id]
    );
    const current = locked.rows[0]?.status as ContestStatus | undefined;
    if (current !== "UNDER_REVIEW") {
      return {
        ok: false,
        code: "invalid_transition",
        message: "A contest can only be finalized from UNDER_REVIEW."
      };
    }

    await repository.finalizeStandings(contest.id, tx);
    await repository.upsertWinners(
      contest.id,
      winnerCount,
      contest.prizeAmountMinor,
      contest.prizeCurrency,
      tx
    );
    await repository.setStatus(contest.id, "FINALIZED", "finalized_at", tx);
    await repository.audit(
      {
        contestId: contest.id,
        action: "CONTEST_FINALIZED",
        actorPubkeyHash,
        target: contest.id,
        before: { status: current },
        after: { status: "FINALIZED", winnerCount },
        reason
      },
      tx
    );
    const updated = await repository.getContest(contest.id, tx);
    return updated ? { ok: true, contest: updated } : { ok: true };
  });
}
