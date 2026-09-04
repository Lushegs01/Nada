/**
 * Process-local counters for the contest engine.
 *
 * Deliberately aggregate-only: nothing here is keyed by identity, so exposing
 * the snapshot reveals how the engine is behaving without revealing anything
 * about who is playing. Counters reset with the process — they answer "is
 * scoring healthy right now?", not "how many points has this contest ever
 * awarded?", which is a Postgres question.
 */
export interface ContestMetrics {
  eventReceived: () => void;
  eventProcessed: () => void;
  eventRejected: (reason: string) => void;
  eventHeld: () => void;
  eventReversed: () => void;
  eventDropped: (reason: string) => void;
  pointsAwarded: (points: number) => void;
  fraudFlag: (riskType: string) => void;
  paymentSuccess: () => void;
  payoutRecorded: (status: "PAID" | "FAILED") => void;
  queueDepth: (depth: number) => void;
  snapshot: () => ContestMetricsSnapshot;
}

export interface ContestMetricsSnapshot {
  contest_events_received_total: number;
  contest_events_processed_total: number;
  contest_events_rejected_total: number;
  contest_events_held_total: number;
  contest_events_reversed_total: number;
  contest_events_dropped_total: number;
  contest_points_awarded_total: number;
  contest_fraud_flags_total: number;
  contest_payment_success_total: number;
  contest_payout_success_total: number;
  contest_payout_failed_total: number;
  contest_queue_depth: number;
  contest_events_rejected_by_reason: Record<string, number>;
  contest_fraud_flags_by_type: Record<string, number>;
  contest_events_dropped_by_reason: Record<string, number>;
}

export function createContestMetrics(): ContestMetrics {
  const counts = {
    received: 0,
    processed: 0,
    rejected: 0,
    held: 0,
    reversed: 0,
    dropped: 0,
    points: 0,
    flags: 0,
    paymentSuccess: 0,
    payoutPaid: 0,
    payoutFailed: 0,
    depth: 0
  };
  const rejectedByReason = new Map<string, number>();
  const flagsByType = new Map<string, number>();
  const droppedByReason = new Map<string, number>();

  const bump = (map: Map<string, number>, key: string): void => {
    map.set(key, (map.get(key) ?? 0) + 1);
  };

  return {
    eventReceived: () => {
      counts.received += 1;
    },
    eventProcessed: () => {
      counts.processed += 1;
    },
    eventRejected: (reason) => {
      counts.rejected += 1;
      bump(rejectedByReason, reason);
    },
    eventHeld: () => {
      counts.held += 1;
    },
    eventReversed: () => {
      counts.reversed += 1;
    },
    eventDropped: (reason) => {
      counts.dropped += 1;
      bump(droppedByReason, reason);
    },
    pointsAwarded: (points) => {
      counts.points += points;
    },
    fraudFlag: (riskType) => {
      counts.flags += 1;
      bump(flagsByType, riskType);
    },
    paymentSuccess: () => {
      counts.paymentSuccess += 1;
    },
    payoutRecorded: (status) => {
      if (status === "PAID") counts.payoutPaid += 1;
      else counts.payoutFailed += 1;
    },
    queueDepth: (depth) => {
      counts.depth = depth;
    },
    snapshot: () => ({
      contest_events_received_total: counts.received,
      contest_events_processed_total: counts.processed,
      contest_events_rejected_total: counts.rejected,
      contest_events_held_total: counts.held,
      contest_events_reversed_total: counts.reversed,
      contest_events_dropped_total: counts.dropped,
      contest_points_awarded_total: counts.points,
      contest_fraud_flags_total: counts.flags,
      contest_payment_success_total: counts.paymentSuccess,
      contest_payout_success_total: counts.payoutPaid,
      contest_payout_failed_total: counts.payoutFailed,
      contest_queue_depth: counts.depth,
      contest_events_rejected_by_reason: Object.fromEntries(rejectedByReason),
      contest_fraud_flags_by_type: Object.fromEntries(flagsByType),
      contest_events_dropped_by_reason: Object.fromEntries(droppedByReason)
    })
  };
}
