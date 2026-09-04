import { randomUUID } from "node:crypto";

import type {
  ContestEventType,
  ContestQualification,
  ContestRiskBand,
  ContestRiskType,
  ContestRules,
  ContestScoreCategory,
  ContestStatus
} from "@nada/types";

import type { Queryable, RelayDb } from "../db";
import { parseRules } from "./rules";

/**
 * Postgres is the contest's source of truth. Redis accelerates leaderboard
 * reads and nothing else: every number this repository returns can be
 * recomputed from these tables alone, which is what makes a lost cache a
 * performance event rather than a correctness one.
 *
 * `bigint` columns come back from pg as strings (an int8 does not fit a JS
 * number safely in general), so every numeric read goes through `num`.
 */

export interface ContestRecord {
  id: string;
  name: string;
  slug: string;
  description: string;
  status: ContestStatus;
  startAtMs: number;
  endAtMs: number;
  registrationStartAtMs: number | null;
  registrationEndAtMs: number | null;
  entryFeeMinor: number;
  entryCurrency: string;
  prizeAmountMinor: number;
  prizeCurrency: string;
  maxParticipants: number | null;
  rulesVersion: number;
  createdAtMs: number;
  updatedAtMs: number;
  publishedAtMs: number | null;
  frozenAtMs: number | null;
  finalizedAtMs: number | null;
  cancelledAtMs: number | null;
}

export interface ParticipantRecord {
  id: string;
  contestId: string;
  pubkeyHash: string;
  displayName: string;
  joinedAtMs: number;
  paymentStatus: "not_required" | "pending" | "paid" | "failed" | "refunded";
  eligibilityStatus: "eligible" | "pending_payment" | "ineligible" | "disqualified";
  riskStatus: ContestRiskBand;
  riskScore: number;
  currentScore: number;
  finalScore: number | null;
  finalRank: number | null;
  disqualifiedAtMs: number | null;
  disqualificationReason: string | null;
}

export interface EngagementEventRecord {
  id: string;
  contestId: string;
  participantPubkeyHash: string;
  actorPubkeyHash: string;
  eventType: ContestEventType;
  sourceEntityType: string;
  sourceEntityId: string;
  pointsAwarded: number;
  qualificationStatus: ContestQualification;
  rejectionReason: string | null;
  riskScore: number;
  rulesVersion: number;
  metadata: Record<string, unknown>;
  occurredAtMs: number;
  createdAtMs: number;
}

export interface LedgerEntryRecord {
  id: string;
  eventId: string | null;
  points: number;
  direction: "CREDIT" | "DEBIT";
  category: ContestScoreCategory;
  reason: string;
  createdAtMs: number;
}

export interface RiskEventRecord {
  id: string;
  participantPubkeyHash: string;
  actorPubkeyHash: string | null;
  eventId: string | null;
  riskType: ContestRiskType;
  severity: "LOW" | "MEDIUM" | "HIGH";
  score: number;
  evidence: Record<string, unknown>;
  createdAtMs: number;
  resolvedAtMs: number | null;
  resolvedBy: string | null;
  resolution: string | null;
}

export interface WinnerRecord {
  id: string;
  participantPubkeyHash: string;
  rank: number;
  finalScore: number;
  prizeAmountMinor: number;
  prizeCurrency: string;
  reviewStatus: "PENDING" | "APPROVED" | "REJECTED";
  approvedBy: string | null;
  approvedAtMs: number | null;
  payoutReference: string | null;
  payoutStatus: "PENDING" | "PAID" | "FAILED";
  payoutNote: string;
}

export interface LeaderboardEntry {
  rank: number;
  pubkeyHash: string;
  displayName: string;
  score: number;
  events: number;
}

export interface ContestStats {
  participants: number;
  activeParticipants: number;
  totalEvents: number;
  validEvents: number;
  suspiciousEvents: number;
  rejectedEvents: number;
  pointsAwarded: number;
  openRiskFlags: number;
  entryRevenueMinor: number;
}

function num(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}

function ms(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") return new Date(value).getTime();
  if (typeof value === "number") return value;
  return 0;
}

function msOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return ms(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

const CONTEST_COLUMNS = `
  id, name, slug, description, status, start_at, end_at,
  registration_start_at, registration_end_at, entry_fee_minor, entry_currency,
  prize_amount_minor, prize_currency, max_participants, rules_version,
  created_at, updated_at, published_at, frozen_at, finalized_at, cancelled_at
`;

interface ContestRow {
  id: string;
  name: string;
  slug: string;
  description: string;
  status: string;
  start_at: Date;
  end_at: Date;
  registration_start_at: Date | null;
  registration_end_at: Date | null;
  entry_fee_minor: string | number;
  entry_currency: string;
  prize_amount_minor: string | number;
  prize_currency: string;
  max_participants: number | null;
  rules_version: number;
  created_at: Date;
  updated_at: Date;
  published_at: Date | null;
  frozen_at: Date | null;
  finalized_at: Date | null;
  cancelled_at: Date | null;
}

function mapContest(row: ContestRow): ContestRecord {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    status: row.status as ContestStatus,
    startAtMs: ms(row.start_at),
    endAtMs: ms(row.end_at),
    registrationStartAtMs: msOrNull(row.registration_start_at),
    registrationEndAtMs: msOrNull(row.registration_end_at),
    entryFeeMinor: num(row.entry_fee_minor),
    entryCurrency: row.entry_currency,
    prizeAmountMinor: num(row.prize_amount_minor),
    prizeCurrency: row.prize_currency,
    maxParticipants: row.max_participants,
    rulesVersion: row.rules_version,
    createdAtMs: ms(row.created_at),
    updatedAtMs: ms(row.updated_at),
    publishedAtMs: msOrNull(row.published_at),
    frozenAtMs: msOrNull(row.frozen_at),
    finalizedAtMs: msOrNull(row.finalized_at),
    cancelledAtMs: msOrNull(row.cancelled_at)
  };
}

interface ParticipantRow {
  id: string;
  contest_id: string;
  pubkey_hash: string;
  display_name: string;
  joined_at: Date;
  payment_status: string;
  eligibility_status: string;
  risk_status: string;
  risk_score: number;
  current_score: string | number;
  final_score: string | number | null;
  final_rank: number | null;
  disqualified_at: Date | null;
  disqualification_reason: string | null;
}

function mapParticipant(row: ParticipantRow): ParticipantRecord {
  return {
    id: row.id,
    contestId: row.contest_id,
    pubkeyHash: row.pubkey_hash,
    displayName: row.display_name,
    joinedAtMs: ms(row.joined_at),
    paymentStatus: row.payment_status as ParticipantRecord["paymentStatus"],
    eligibilityStatus: row.eligibility_status as ParticipantRecord["eligibilityStatus"],
    riskStatus: row.risk_status as ContestRiskBand,
    riskScore: row.risk_score,
    currentScore: num(row.current_score),
    finalScore: row.final_score === null ? null : num(row.final_score),
    finalRank: row.final_rank,
    disqualifiedAtMs: msOrNull(row.disqualified_at),
    disqualificationReason: row.disqualification_reason
  };
}

interface EventRow {
  id: string;
  contest_id: string;
  participant_pubkey_hash: string;
  actor_pubkey_hash: string;
  event_type: string;
  source_entity_type: string;
  source_entity_id: string;
  points_awarded: string | number;
  qualification_status: string;
  rejection_reason: string | null;
  risk_score: number;
  rules_version: number;
  metadata: unknown;
  occurred_at_ms: string | number;
  created_at: Date;
}

function mapEvent(row: EventRow): EngagementEventRecord {
  return {
    id: row.id,
    contestId: row.contest_id,
    participantPubkeyHash: row.participant_pubkey_hash,
    actorPubkeyHash: row.actor_pubkey_hash,
    eventType: row.event_type as ContestEventType,
    sourceEntityType: row.source_entity_type,
    sourceEntityId: row.source_entity_id,
    pointsAwarded: num(row.points_awarded),
    qualificationStatus: row.qualification_status as ContestQualification,
    rejectionReason: row.rejection_reason,
    riskScore: row.risk_score,
    rulesVersion: row.rules_version,
    metadata: asRecord(row.metadata),
    occurredAtMs: num(row.occurred_at_ms),
    createdAtMs: ms(row.created_at)
  };
}

export interface CreateContestInput {
  name: string;
  slug: string;
  description: string;
  startAtMs: number;
  endAtMs: number;
  registrationStartAtMs?: number | undefined;
  registrationEndAtMs?: number | undefined;
  entryFeeMinor: number;
  entryCurrency: string;
  prizeAmountMinor: number;
  prizeCurrency: string;
  maxParticipants?: number | undefined;
  rules: ContestRules;
  createdBy: string;
}

export interface RecordEventInput {
  contestId: string;
  participantPubkeyHash: string;
  actorPubkeyHash: string;
  eventType: ContestEventType;
  sourceEntityType: string;
  sourceEntityId: string;
  occurredAtMs: number;
  idempotencyKey: string;
  metadata: Record<string, unknown>;
}

export class ContestRepository {
  constructor(private readonly db: RelayDb) {}

  get database(): RelayDb {
    return this.db;
  }

  // ── Contests ──────────────────────────────────────────────────────────────

  async createContest(input: CreateContestInput): Promise<ContestRecord> {
    return this.db.withTransaction(async (tx) => {
      const id = randomUUID();
      const inserted = await tx.query<ContestRow>(
        `insert into contests (
           id, name, slug, description, status, start_at, end_at,
           registration_start_at, registration_end_at, entry_fee_minor,
           entry_currency, prize_amount_minor, prize_currency, max_participants,
           rules_version, created_at, updated_at
         ) values (
           $1, $2, $3, $4, 'DRAFT', to_timestamp($5::bigint / 1000.0),
           to_timestamp($6::bigint / 1000.0),
           case when $7::bigint is null then null else to_timestamp($7::bigint / 1000.0) end,
           case when $8::bigint is null then null else to_timestamp($8::bigint / 1000.0) end,
           $9, $10, $11, $12, $13, 1, now(), now()
         )
         returning ${CONTEST_COLUMNS}`,
        [
          id,
          input.name,
          input.slug,
          input.description,
          input.startAtMs,
          input.endAtMs,
          input.registrationStartAtMs ?? null,
          input.registrationEndAtMs ?? null,
          input.entryFeeMinor,
          input.entryCurrency,
          input.prizeAmountMinor,
          input.prizeCurrency,
          input.maxParticipants ?? null
        ]
      );
      await tx.query(
        `insert into contest_rule_versions (contest_id, version, rules, note, created_by, created_at)
         values ($1, 1, $2::jsonb, 'Initial ruleset', $3, now())`,
        [id, JSON.stringify(input.rules), input.createdBy]
      );
      const row = inserted.rows[0];
      if (!row) throw new Error("Contest insert returned no row.");
      return mapContest(row);
    });
  }

  async getContest(id: string, tx: Queryable = this.db): Promise<ContestRecord | null> {
    const result = await tx.query<ContestRow>(
      `select ${CONTEST_COLUMNS} from contests where id = $1`,
      [id]
    );
    const row = result.rows[0];
    return row ? mapContest(row) : null;
  }

  async getContestBySlug(slug: string): Promise<ContestRecord | null> {
    const result = await this.db.query<ContestRow>(
      `select ${CONTEST_COLUMNS} from contests where slug = $1`,
      [slug]
    );
    const row = result.rows[0];
    return row ? mapContest(row) : null;
  }

  /** Contests a visitor may see: everything past DRAFT, newest window first. */
  async listPublicContests(limit: number): Promise<ContestRecord[]> {
    const result = await this.db.query<ContestRow>(
      `select ${CONTEST_COLUMNS} from contests
        where status <> 'DRAFT'
        order by start_at desc
        limit $1`,
      [limit]
    );
    return result.rows.map(mapContest);
  }

  async listAllContests(limit: number): Promise<ContestRecord[]> {
    const result = await this.db.query<ContestRow>(
      `select ${CONTEST_COLUMNS} from contests order by created_at desc limit $1`,
      [limit]
    );
    return result.rows.map(mapContest);
  }

  /**
   * Contests currently accepting engagement: ACTIVE and inside their window.
   * The scoring path calls this on every event, so it is deliberately a
   * narrow, index-backed read that the service layer caches briefly.
   */
  async listScoringContests(nowMs: number): Promise<ContestRecord[]> {
    const result = await this.db.query<ContestRow>(
      `select ${CONTEST_COLUMNS} from contests
        where status = 'ACTIVE'
          and start_at <= to_timestamp($1::bigint / 1000.0)
          and end_at > to_timestamp($1::bigint / 1000.0)`,
      [nowMs]
    );
    return result.rows.map(mapContest);
  }

  /**
   * Contests whose clock has moved past a boundary the operator would
   * otherwise have to babysit: registration closing into ACTIVE at the start
   * time, and ACTIVE closing into FROZEN at the end time. Auto-freezing is the
   * one that matters — it is what actually stops scoring at the deadline, so a
   * late event cannot land after the contest is over.
   */
  async dueLifecycleTransitions(
    nowMs: number
  ): Promise<Array<{ id: string; from: ContestStatus; to: ContestStatus }>> {
    const result = await this.db.query<{ id: string; status: string; target: string }>(
      `select id, status,
              case when status = 'REGISTRATION_OPEN' then 'ACTIVE' else 'FROZEN' end as target
         from contests
        where (status = 'REGISTRATION_OPEN' and start_at <= to_timestamp($1::bigint / 1000.0))
           or (status = 'ACTIVE' and end_at <= to_timestamp($1::bigint / 1000.0))
        limit 50`,
      [nowMs]
    );
    return result.rows.map((row) => ({
      id: row.id,
      from: row.status as ContestStatus,
      to: row.target as ContestStatus
    }));
  }

  async getRules(
    contestId: string,
    version: number,
    tx: Queryable = this.db
  ): Promise<ContestRules | null> {
    const result = await tx.query<{ rules: unknown }>(
      "select rules from contest_rule_versions where contest_id = $1 and version = $2",
      [contestId, version]
    );
    const row = result.rows[0];
    return row ? parseRules(row.rules) : null;
  }

  async listRuleVersions(
    contestId: string
  ): Promise<Array<{ version: number; rules: ContestRules; note: string; createdAtMs: number; createdBy: string }>> {
    const result = await this.db.query<{
      version: number;
      rules: unknown;
      note: string;
      created_at: Date;
      created_by: string;
    }>(
      `select version, rules, note, created_at, created_by
         from contest_rule_versions where contest_id = $1 order by version asc`,
      [contestId]
    );
    return result.rows.map((row) => ({
      version: row.version,
      rules: parseRules(row.rules),
      note: row.note,
      createdAtMs: ms(row.created_at),
      createdBy: row.created_by
    }));
  }

  /** Appends the next immutable rules version and points the contest at it. */
  async addRuleVersion(
    contestId: string,
    rules: ContestRules,
    createdBy: string,
    note: string,
    tx: Queryable
  ): Promise<number> {
    const next = await tx.query<{ version: number }>(
      `select coalesce(max(version), 0) + 1 as version
         from contest_rule_versions where contest_id = $1`,
      [contestId]
    );
    const version = next.rows[0]?.version ?? 1;
    await tx.query(
      `insert into contest_rule_versions (contest_id, version, rules, note, created_by, created_at)
       values ($1, $2, $3::jsonb, $4, $5, now())`,
      [contestId, version, JSON.stringify(rules), note, createdBy]
    );
    await tx.query(
      "update contests set rules_version = $2, updated_at = now() where id = $1",
      [contestId, version]
    );
    return version;
  }

  async setStatus(
    contestId: string,
    status: ContestStatus,
    stampColumn: "published_at" | "frozen_at" | "finalized_at" | "cancelled_at" | null,
    tx: Queryable
  ): Promise<void> {
    const stamp = stampColumn ? `, ${stampColumn} = now()` : "";
    await tx.query(
      `update contests set status = $2, updated_at = now()${stamp} where id = $1`,
      [contestId, status]
    );
  }

  // ── Participants ──────────────────────────────────────────────────────────

  async getParticipant(
    contestId: string,
    pubkeyHash: string,
    tx: Queryable = this.db
  ): Promise<ParticipantRecord | null> {
    const result = await tx.query<ParticipantRow>(
      `select * from contest_participants where contest_id = $1 and pubkey_hash = $2`,
      [contestId, pubkeyHash]
    );
    const row = result.rows[0];
    return row ? mapParticipant(row) : null;
  }

  /**
   * Joins a contest, or returns the existing row unchanged. Concurrent joins
   * from two tabs resolve to one participant because of the unique index; the
   * `do update` no-op is what lets the insert still return the row.
   */
  async upsertParticipant(input: {
    contestId: string;
    pubkeyHash: string;
    displayName: string;
    paymentStatus: ParticipantRecord["paymentStatus"];
    eligibilityStatus: ParticipantRecord["eligibilityStatus"];
  }): Promise<ParticipantRecord> {
    const result = await this.db.query<ParticipantRow>(
      `insert into contest_participants (
         id, contest_id, pubkey_hash, display_name, joined_at,
         payment_status, eligibility_status, created_at, updated_at
       ) values ($1, $2, $3, $4, now(), $5, $6, now(), now())
       on conflict (contest_id, pubkey_hash) do update
         set display_name = excluded.display_name, updated_at = now()
       returning *`,
      [
        randomUUID(),
        input.contestId,
        input.pubkeyHash,
        input.displayName,
        input.paymentStatus,
        input.eligibilityStatus
      ]
    );
    const row = result.rows[0];
    if (!row) throw new Error("Participant upsert returned no row.");
    return mapParticipant(row);
  }

  async countParticipants(contestId: string): Promise<number> {
    const result = await this.db.query<{ n: string }>(
      "select count(*) as n from contest_participants where contest_id = $1",
      [contestId]
    );
    return num(result.rows[0]?.n);
  }

  async listParticipants(
    contestId: string,
    limit: number,
    offset: number
  ): Promise<Array<ParticipantRecord & { events: number; lastActiveAtMs: number | null }>> {
    const result = await this.db.query<
      ParticipantRow & { events: string; last_active_ms: string | null }
    >(
      `select p.*,
              coalesce(e.events, 0) as events,
              e.last_active_ms
         from contest_participants p
         left join (
           select participant_pubkey_hash, count(*) as events,
                  max(occurred_at_ms) as last_active_ms
             from contest_engagement_events
            where contest_id = $1
            group by participant_pubkey_hash
         ) e on e.participant_pubkey_hash = p.pubkey_hash
        where p.contest_id = $1
        order by p.current_score desc, p.joined_at asc
        limit $2 offset $3`,
      [contestId, limit, offset]
    );
    return result.rows.map((row) => ({
      ...mapParticipant(row),
      events: num(row.events),
      lastActiveAtMs: row.last_active_ms === null ? null : num(row.last_active_ms)
    }));
  }

  async setParticipantPayment(
    contestId: string,
    pubkeyHash: string,
    paymentStatus: ParticipantRecord["paymentStatus"],
    eligibilityStatus: ParticipantRecord["eligibilityStatus"],
    tx: Queryable = this.db
  ): Promise<void> {
    await tx.query(
      `update contest_participants
          set payment_status = $3, eligibility_status = $4, updated_at = now()
        where contest_id = $1 and pubkey_hash = $2`,
      [contestId, pubkeyHash, paymentStatus, eligibilityStatus]
    );
  }

  async disqualifyParticipant(
    contestId: string,
    pubkeyHash: string,
    reason: string,
    tx: Queryable
  ): Promise<void> {
    await tx.query(
      `update contest_participants
          set eligibility_status = 'disqualified',
              disqualified_at = now(),
              disqualification_reason = $3,
              updated_at = now()
        where contest_id = $1 and pubkey_hash = $2`,
      [contestId, pubkeyHash, reason]
    );
  }

  async reinstateParticipant(
    contestId: string,
    pubkeyHash: string,
    tx: Queryable
  ): Promise<void> {
    await tx.query(
      `update contest_participants
          set eligibility_status = case
                when payment_status = 'pending' then 'pending_payment'
                else 'eligible'
              end,
              disqualified_at = null,
              disqualification_reason = null,
              updated_at = now()
        where contest_id = $1 and pubkey_hash = $2`,
      [contestId, pubkeyHash]
    );
  }

  // ── Engagement events ─────────────────────────────────────────────────────

  /**
   * Durably records an event before any scoring happens, so a crash between
   * recording and scoring leaves work to resume rather than a point silently
   * never awarded. Returns null when the event was already recorded — that is
   * the idempotency guarantee, enforced by a unique index rather than by a
   * read-then-write race.
   */
  async insertPendingEvent(input: RecordEventInput): Promise<EngagementEventRecord | null> {
    const result = await this.db.query<EventRow>(
      `insert into contest_engagement_events (
         id, contest_id, participant_pubkey_hash, actor_pubkey_hash, event_type,
         source_entity_type, source_entity_id, qualification_status, metadata,
         occurred_at_ms, created_at, idempotency_key
       ) values ($1, $2, $3, $4, $5, $6, $7, 'PENDING', $8::jsonb, $9, now(), $10)
       on conflict (idempotency_key) do nothing
       returning *`,
      [
        randomUUID(),
        input.contestId,
        input.participantPubkeyHash,
        input.actorPubkeyHash,
        input.eventType,
        input.sourceEntityType,
        input.sourceEntityId,
        JSON.stringify(input.metadata),
        input.occurredAtMs,
        input.idempotencyKey
      ]
    );
    const row = result.rows[0];
    return row ? mapEvent(row) : null;
  }

  /**
   * Takes ownership of a PENDING event for scoring. The conditional update is
   * the claim: two workers racing on the same event produce exactly one
   * winner, so points cannot be awarded twice.
   */
  async claimEventForScoring(
    eventId: string,
    tx: Queryable
  ): Promise<EngagementEventRecord | null> {
    const result = await tx.query<EventRow>(
      `select * from contest_engagement_events
        where id = $1 and qualification_status = 'PENDING'
        for update skip locked`,
      [eventId]
    );
    const row = result.rows[0];
    return row ? mapEvent(row) : null;
  }

  async getEvent(eventId: string): Promise<EngagementEventRecord | null> {
    const result = await this.db.query<EventRow>(
      "select * from contest_engagement_events where id = $1",
      [eventId]
    );
    const row = result.rows[0];
    return row ? mapEvent(row) : null;
  }

  async listPendingEventIds(limit: number, olderThanMs: number): Promise<string[]> {
    const result = await this.db.query<{ id: string }>(
      `select e.id from contest_engagement_events e
         join contests c on c.id = e.contest_id
        where e.qualification_status = 'PENDING'
          and e.created_at < now() - make_interval(secs => $2::double precision)
          and c.status = 'ACTIVE'
        order by e.created_at asc
        limit $1`,
      [limit, olderThanMs / 1000]
    );
    return result.rows.map((row) => row.id);
  }

  async settleEvent(
    eventId: string,
    update: {
      qualificationStatus: ContestQualification;
      pointsAwarded: number;
      riskScore: number;
      rulesVersion: number;
      rejectionReason: string | null;
    },
    tx: Queryable
  ): Promise<void> {
    await tx.query(
      `update contest_engagement_events
          set qualification_status = $2,
              points_awarded = $3,
              risk_score = $4,
              rules_version = $5,
              rejection_reason = $6,
              processed_at = now()
        where id = $1`,
      [
        eventId,
        update.qualificationStatus,
        update.pointsAwarded,
        update.riskScore,
        update.rulesVersion,
        update.rejectionReason
      ]
    );
  }

  async listEvents(
    contestId: string,
    options: {
      participantPubkeyHash?: string | undefined;
      status?: ContestQualification | undefined;
      limit: number;
      before?: number | undefined;
    }
  ): Promise<EngagementEventRecord[]> {
    const conditions = ["contest_id = $1"];
    const params: unknown[] = [contestId];
    if (options.participantPubkeyHash) {
      params.push(options.participantPubkeyHash);
      conditions.push(`participant_pubkey_hash = $${params.length}`);
    }
    if (options.status) {
      params.push(options.status);
      conditions.push(`qualification_status = $${params.length}`);
    }
    if (options.before) {
      params.push(options.before);
      conditions.push(`occurred_at_ms < $${params.length}`);
    }
    params.push(options.limit);
    const result = await this.db.query<EventRow>(
      `select * from contest_engagement_events
        where ${conditions.join(" and ")}
        order by occurred_at_ms desc
        limit $${params.length}`,
      params
    );
    return result.rows.map(mapEvent);
  }

  /** Every scored event tied to one piece of content, for reversal. */
  async listEventsForSource(
    sourceEntityType: string,
    sourceEntityId: string
  ): Promise<EngagementEventRecord[]> {
    const result = await this.db.query<EventRow>(
      `select * from contest_engagement_events
        where source_entity_type = $1 and source_entity_id = $2
          and qualification_status in ('VALID', 'PENDING_REVIEW')`,
      [sourceEntityType, sourceEntityId]
    );
    return result.rows.map(mapEvent);
  }

  async listEventsForPair(input: {
    contestId: string;
    participantPubkeyHash: string;
    actorPubkeyHash: string;
    eventType: ContestEventType;
    sourceEntityId: string;
  }): Promise<EngagementEventRecord[]> {
    const result = await this.db.query<EventRow>(
      `select * from contest_engagement_events
        where contest_id = $1 and participant_pubkey_hash = $2
          and actor_pubkey_hash = $3 and event_type = $4 and source_entity_id = $5
          and qualification_status in ('VALID', 'PENDING_REVIEW')`,
      [
        input.contestId,
        input.participantPubkeyHash,
        input.actorPubkeyHash,
        input.eventType,
        input.sourceEntityId
      ]
    );
    return result.rows.map(mapEvent);
  }

  // ── Ledger ────────────────────────────────────────────────────────────────

  /**
   * Writes one ledger row and moves the cached participant score by the same
   * amount, in the caller's transaction. Returns false when a row for this
   * (event, direction) already exists — the unique index turning a replayed
   * credit or a replayed reversal into a no-op.
   */
  async appendLedger(
    input: {
      contestId: string;
      participantPubkeyHash: string;
      eventId: string | null;
      points: number;
      direction: "CREDIT" | "DEBIT";
      category: ContestScoreCategory;
      reason: string;
      createdBy?: string | undefined;
    },
    tx: Queryable
  ): Promise<boolean> {
    const inserted = await tx.query<{ id: string }>(
      `insert into contest_score_ledger (
         id, contest_id, participant_pubkey_hash, event_id, points, direction,
         category, reason, created_by, created_at
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
       on conflict (event_id, direction) where event_id is not null do nothing
       returning id`,
      [
        randomUUID(),
        input.contestId,
        input.participantPubkeyHash,
        input.eventId,
        input.points,
        input.direction,
        input.category,
        input.reason,
        input.createdBy ?? null
      ]
    );
    if (inserted.rows.length === 0) return false;

    const delta = input.direction === "CREDIT" ? input.points : -input.points;
    await tx.query(
      `update contest_participants
          set current_score = greatest(0, current_score + $3), updated_at = now()
        where contest_id = $1 and pubkey_hash = $2`,
      [input.contestId, input.participantPubkeyHash, delta]
    );
    return true;
  }

  async listLedger(
    contestId: string,
    pubkeyHash: string,
    limit: number
  ): Promise<LedgerEntryRecord[]> {
    const result = await this.db.query<{
      id: string;
      event_id: string | null;
      points: string | number;
      direction: string;
      category: string;
      reason: string;
      created_at: Date;
    }>(
      `select id, event_id, points, direction, category, reason, created_at
         from contest_score_ledger
        where contest_id = $1 and participant_pubkey_hash = $2
        order by created_at desc
        limit $3`,
      [contestId, pubkeyHash, limit]
    );
    return result.rows.map((row) => ({
      id: row.id,
      eventId: row.event_id,
      points: num(row.points),
      direction: row.direction as "CREDIT" | "DEBIT",
      category: row.category as ContestScoreCategory,
      reason: row.reason,
      createdAtMs: ms(row.created_at)
    }));
  }

  /** The authoritative score: rebuilt from the ledger, never from the cache. */
  async reconstructScore(contestId: string, pubkeyHash: string): Promise<number> {
    const result = await this.db.query<{ total: string | null }>(
      `select coalesce(sum(case when direction = 'CREDIT' then points else -points end), 0) as total
         from contest_score_ledger
        where contest_id = $1 and participant_pubkey_hash = $2`,
      [contestId, pubkeyHash]
    );
    return Math.max(0, num(result.rows[0]?.total));
  }

  async scoreBreakdown(
    contestId: string,
    pubkeyHash: string
  ): Promise<Array<{ category: ContestScoreCategory; points: number }>> {
    const result = await this.db.query<{ category: string; total: string | null }>(
      `select category,
              coalesce(sum(case when direction = 'CREDIT' then points else -points end), 0) as total
         from contest_score_ledger
        where contest_id = $1 and participant_pubkey_hash = $2
        group by category
        order by 2 desc`,
      [contestId, pubkeyHash]
    );
    return result.rows.map((row) => ({
      category: row.category as ContestScoreCategory,
      points: num(row.total)
    }));
  }

  // ── Caps and windows ──────────────────────────────────────────────────────

  async pointsSince(
    contestId: string,
    pubkeyHash: string,
    sinceMs: number,
    tx: Queryable
  ): Promise<number> {
    const result = await tx.query<{ total: string | null }>(
      `select coalesce(sum(points_awarded), 0) as total
         from contest_engagement_events
        where contest_id = $1 and participant_pubkey_hash = $2
          and qualification_status = 'VALID' and occurred_at_ms >= $3`,
      [contestId, pubkeyHash, sinceMs]
    );
    return num(result.rows[0]?.total);
  }

  async eventCountSince(
    contestId: string,
    pubkeyHash: string,
    eventType: ContestEventType,
    sinceMs: number,
    tx: Queryable
  ): Promise<number> {
    const result = await tx.query<{ n: string }>(
      `select count(*) as n from contest_engagement_events
        where contest_id = $1 and participant_pubkey_hash = $2
          and event_type = $3 and qualification_status = 'VALID'
          and occurred_at_ms >= $4`,
      [contestId, pubkeyHash, eventType, sinceMs]
    );
    return num(result.rows[0]?.n);
  }

  /** Points and interaction count one actor produced for one participant. */
  async pairActivitySince(
    contestId: string,
    participantPubkeyHash: string,
    actorPubkeyHash: string,
    sinceMs: number,
    tx: Queryable
  ): Promise<{ points: number; interactions: number }> {
    const result = await tx.query<{ total: string | null; n: string }>(
      `select coalesce(sum(points_awarded), 0) as total, count(*) as n
         from contest_engagement_events
        where contest_id = $1 and participant_pubkey_hash = $2
          and actor_pubkey_hash = $3 and qualification_status = 'VALID'
          and occurred_at_ms >= $4`,
      [contestId, participantPubkeyHash, actorPubkeyHash, sinceMs]
    );
    const row = result.rows[0];
    return { points: num(row?.total), interactions: num(row?.n) };
  }

  async sourceEntityPoints(
    contestId: string,
    sourceEntityType: string,
    sourceEntityId: string,
    tx: Queryable
  ): Promise<number> {
    const result = await tx.query<{ total: string | null }>(
      `select coalesce(sum(points_awarded), 0) as total
         from contest_engagement_events
        where contest_id = $1 and source_entity_type = $2 and source_entity_id = $3
          and qualification_status = 'VALID'`,
      [contestId, sourceEntityType, sourceEntityId]
    );
    return num(result.rows[0]?.total);
  }

  async lastActorEventMs(
    contestId: string,
    actorPubkeyHash: string,
    eventType: ContestEventType,
    excludeEventId: string,
    tx: Queryable
  ): Promise<number | null> {
    const result = await tx.query<{ last_ms: string | null }>(
      `select max(occurred_at_ms) as last_ms from contest_engagement_events
        where contest_id = $1 and actor_pubkey_hash = $2 and event_type = $3
          and qualification_status = 'VALID' and id <> $4`,
      [contestId, actorPubkeyHash, eventType, excludeEventId]
    );
    const value = result.rows[0]?.last_ms;
    return value === null || value === undefined ? null : num(value);
  }

  async actorEventCountSince(
    contestId: string,
    actorPubkeyHash: string,
    sinceMs: number,
    tx: Queryable
  ): Promise<number> {
    const result = await tx.query<{ n: string }>(
      `select count(*) as n from contest_engagement_events
        where contest_id = $1 and actor_pubkey_hash = $2 and occurred_at_ms >= $3`,
      [contestId, actorPubkeyHash, sinceMs]
    );
    return num(result.rows[0]?.n);
  }

  async participantEventCountSince(
    contestId: string,
    pubkeyHash: string,
    sinceMs: number,
    tx: Queryable
  ): Promise<number> {
    const result = await tx.query<{ n: string }>(
      `select count(*) as n from contest_engagement_events
        where contest_id = $1 and participant_pubkey_hash = $2 and occurred_at_ms >= $3`,
      [contestId, pubkeyHash, sinceMs]
    );
    return num(result.rows[0]?.n);
  }

  async sourceEntityEventCount(
    contestId: string,
    sourceEntityType: string,
    sourceEntityId: string,
    tx: Queryable
  ): Promise<number> {
    const result = await tx.query<{ n: string }>(
      `select count(*) as n from contest_engagement_events
        where contest_id = $1 and source_entity_type = $2 and source_entity_id = $3`,
      [contestId, sourceEntityType, sourceEntityId]
    );
    return num(result.rows[0]?.n);
  }

  /** Recent inter-arrival times for one actor, newest first. */
  async recentActorTimestamps(
    contestId: string,
    actorPubkeyHash: string,
    limit: number,
    tx: Queryable
  ): Promise<number[]> {
    const result = await tx.query<{ occurred_at_ms: string | number }>(
      `select occurred_at_ms from contest_engagement_events
        where contest_id = $1 and actor_pubkey_hash = $2
        order by occurred_at_ms desc limit $3`,
      [contestId, actorPubkeyHash, limit]
    );
    return result.rows.map((row) => num(row.occurred_at_ms));
  }

  /**
   * When an identity first appeared anywhere on NADA. Read from signals the
   * product already keeps — a profile row and the author's first Echo — rather
   * than any new per-user tracking introduced for the contest.
   */
  async identityFirstSeenMs(pubkeyHash: string, tx: Queryable): Promise<number | null> {
    const result = await tx.query<{ first_seen_ms: string | null }>(
      `select least(
                (select created_at_ms from whisper_profiles where pubkey_hash = $1),
                (select min(created_at_ms) from whisper_echoes where author_pubkey_hash = $1)
              ) as first_seen_ms`,
      [pubkeyHash]
    );
    const value = result.rows[0]?.first_seen_ms;
    return value === null || value === undefined ? null : num(value);
  }

  /** Share of a participant's received points coming from their top contributor. */
  async topContributorShare(
    contestId: string,
    pubkeyHash: string
  ): Promise<{ share: number; events: number; topActor: string | null }> {
    const result = await this.db.query<{
      actor_pubkey_hash: string;
      actor_points: string;
      total_points: string;
      total_events: string;
    }>(
      `with received as (
         select actor_pubkey_hash, points_awarded
           from contest_engagement_events
          where contest_id = $1 and participant_pubkey_hash = $2
            and qualification_status = 'VALID'
            and actor_pubkey_hash <> participant_pubkey_hash
       )
       select actor_pubkey_hash,
              sum(points_awarded) as actor_points,
              (select coalesce(sum(points_awarded), 0) from received) as total_points,
              (select count(*) from received) as total_events
         from received
        group by actor_pubkey_hash
        order by 2 desc
        limit 1`,
      [contestId, pubkeyHash]
    );
    const row = result.rows[0];
    if (!row) return { share: 0, events: 0, topActor: null };
    const total = num(row.total_points);
    return {
      share: total > 0 ? num(row.actor_points) / total : 0,
      events: num(row.total_events),
      topActor: row.actor_pubkey_hash
    };
  }

  /**
   * Replays a contest's window from the Whisper tables so nothing that
   * happened can be missing from the ledger.
   *
   * This is what makes the engine recoverable from Postgres alone: the queue
   * is best-effort, but the Whisper rows are the product's own durable record
   * of what people did, and every event derived from them carries a
   * deterministic idempotency key — so replaying a window that was already
   * scored is a no-op, and replaying one that was dropped fills the gap.
   *
   * Paged with a row-value cursor rather than an offset, so a reconciliation
   * over millions of rows stays linear and cannot skip or repeat a row when
   * several share a millisecond.
   */
  async reconciliationBatch(input: {
    contestId: string;
    startAtMs: number;
    endAtMs: number;
    cursor: { occurredAtMs: number; sourceId: string; eventType: string } | null;
    limit: number;
  }): Promise<
    Array<{
      eventType: ContestEventType;
      participantPubkeyHash: string;
      actorPubkeyHash: string;
      sourceEntityType: string;
      sourceEntityId: string;
      occurredAtMs: number;
    }>
  > {
    const cursor = input.cursor ?? { occurredAtMs: -1, sourceId: "", eventType: "" };
    const result = await this.db.query<{
      event_type: string;
      participant: string;
      actor: string;
      source_type: string;
      source_id: string;
      occurred_at_ms: string | number;
    }>(
      `with participants as (
         select pubkey_hash from contest_participants
          where contest_id = $1 and eligibility_status <> 'disqualified'
       ),
       signals as (
         select 'ECHO_CREATED' as event_type, e.author_pubkey_hash as participant,
                e.author_pubkey_hash as actor, 'echo' as source_type,
                e.id::text as source_id, e.created_at_ms as occurred_at_ms
           from whisper_echoes e
          where e.ripple_of_id is null
            and e.author_pubkey_hash in (select pubkey_hash from participants)
         union all
         select 'RIPPLE_CREATED', r.rippler_pubkey_hash, r.rippler_pubkey_hash, 'echo',
                r.echo_id::text, r.created_at_ms
           from whisper_ripples r
          where r.rippler_pubkey_hash in (select pubkey_hash from participants)
         union all
         select 'RIPPLE_RECEIVED', e.author_pubkey_hash, r.rippler_pubkey_hash, 'echo',
                r.echo_id::text, r.created_at_ms
           from whisper_ripples r
           join whisper_echoes e on e.id = r.echo_id
          where e.author_pubkey_hash in (select pubkey_hash from participants)
         union all
         select 'REFLECTION_CREATED', f.author_pubkey_hash, f.author_pubkey_hash,
                'reflection', f.id::text, f.created_at_ms
           from whisper_reflections f
          where f.deleted_at_ms is null
            and f.author_pubkey_hash in (select pubkey_hash from participants)
         union all
         select 'REFLECTION_RECEIVED', e.author_pubkey_hash, f.author_pubkey_hash,
                'reflection', f.id::text, f.created_at_ms
           from whisper_reflections f
           join whisper_echoes e on e.id = f.echo_id
          where f.deleted_at_ms is null
            and e.author_pubkey_hash in (select pubkey_hash from participants)
         union all
         select 'REACTION_RECEIVED', e.author_pubkey_hash, x.reactor_pubkey_hash, 'echo',
                e.id::text, x.created_at_ms
           from whisper_reactions x
           join whisper_echoes e on e.id = x.echo_id
          where e.author_pubkey_hash in (select pubkey_hash from participants)
         union all
         select 'REFLECTION_REACTION_RECEIVED', f.author_pubkey_hash, x.reactor_pubkey_hash,
                'reflection', f.id::text, x.created_at_ms
           from whisper_reflection_reactions x
           join whisper_reflections f on f.id = x.reflection_id
          where f.deleted_at_ms is null
            and f.author_pubkey_hash in (select pubkey_hash from participants)
         union all
         select 'FOLLOW_RECEIVED', w.followee_pubkey_hash, w.follower_pubkey_hash, 'follow',
                w.follower_pubkey_hash || ':' || w.followee_pubkey_hash, w.created_at_ms
           from whisper_follows w
          where w.followee_pubkey_hash in (select pubkey_hash from participants)
       )
       select event_type, participant, actor, source_type, source_id, occurred_at_ms
         from signals
        where occurred_at_ms >= $2 and occurred_at_ms < $3
          and (occurred_at_ms, source_id, event_type) > ($4::bigint, $5::text, $6::text)
        order by occurred_at_ms asc, source_id asc, event_type asc
        limit $7`,
      [
        input.contestId,
        input.startAtMs,
        input.endAtMs,
        cursor.occurredAtMs,
        cursor.sourceId,
        cursor.eventType,
        input.limit
      ]
    );
    return result.rows.map((row) => ({
      eventType: row.event_type as ContestEventType,
      participantPubkeyHash: row.participant,
      actorPubkeyHash: row.actor,
      sourceEntityType: row.source_type,
      sourceEntityId: row.source_id,
      occurredAtMs: num(row.occurred_at_ms)
    }));
  }

  // ── Risk ──────────────────────────────────────────────────────────────────

  async recordRiskEvent(
    input: {
      contestId: string;
      participantPubkeyHash: string;
      actorPubkeyHash: string | null;
      eventId: string | null;
      riskType: ContestRiskType;
      severity: "LOW" | "MEDIUM" | "HIGH";
      score: number;
      evidence: Record<string, unknown>;
      dedupeKey: string;
    },
    tx: Queryable
  ): Promise<boolean> {
    const result = await tx.query<{ id: string }>(
      `insert into contest_risk_events (
         id, contest_id, participant_pubkey_hash, actor_pubkey_hash, event_id,
         risk_type, severity, score, evidence, dedupe_key, created_at
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, now())
       on conflict (contest_id, participant_pubkey_hash, risk_type, dedupe_key) do nothing
       returning id`,
      [
        randomUUID(),
        input.contestId,
        input.participantPubkeyHash,
        input.actorPubkeyHash,
        input.eventId,
        input.riskType,
        input.severity,
        input.score,
        JSON.stringify(input.evidence),
        input.dedupeKey
      ]
    );
    return result.rows.length > 0;
  }

  /** Cumulative unresolved risk for a participant, clamped to the 0–100 scale. */
  async cumulativeRisk(
    contestId: string,
    pubkeyHash: string,
    tx: Queryable
  ): Promise<number> {
    const result = await tx.query<{ total: string | null }>(
      `select coalesce(sum(score), 0) as total from contest_risk_events
        where contest_id = $1 and participant_pubkey_hash = $2 and resolved_at is null`,
      [contestId, pubkeyHash]
    );
    return Math.min(100, Math.max(0, num(result.rows[0]?.total)));
  }

  async setParticipantRisk(
    contestId: string,
    pubkeyHash: string,
    riskScore: number,
    riskStatus: ContestRiskBand,
    tx: Queryable
  ): Promise<void> {
    await tx.query(
      `update contest_participants
          set risk_score = $3, risk_status = $4, updated_at = now()
        where contest_id = $1 and pubkey_hash = $2`,
      [contestId, pubkeyHash, riskScore, riskStatus]
    );
  }

  async listRiskEvents(
    contestId: string,
    options: { participantPubkeyHash?: string | undefined; limit: number; offset: number }
  ): Promise<RiskEventRecord[]> {
    const params: unknown[] = [contestId];
    let filter = "";
    if (options.participantPubkeyHash) {
      params.push(options.participantPubkeyHash);
      filter = ` and participant_pubkey_hash = $${params.length}`;
    }
    params.push(options.limit, options.offset);
    const result = await this.db.query<{
      id: string;
      participant_pubkey_hash: string;
      actor_pubkey_hash: string | null;
      event_id: string | null;
      risk_type: string;
      severity: string;
      score: number;
      evidence: unknown;
      created_at: Date;
      resolved_at: Date | null;
      resolved_by: string | null;
      resolution: string | null;
    }>(
      `select id, participant_pubkey_hash, actor_pubkey_hash, event_id, risk_type,
              severity, score, evidence, created_at, resolved_at, resolved_by, resolution
         from contest_risk_events
        where contest_id = $1${filter}
        order by created_at desc
        limit $${params.length - 1} offset $${params.length}`,
      params
    );
    return result.rows.map((row) => ({
      id: row.id,
      participantPubkeyHash: row.participant_pubkey_hash,
      actorPubkeyHash: row.actor_pubkey_hash,
      eventId: row.event_id,
      riskType: row.risk_type as ContestRiskType,
      severity: row.severity as "LOW" | "MEDIUM" | "HIGH",
      score: row.score,
      evidence: asRecord(row.evidence),
      createdAtMs: ms(row.created_at),
      resolvedAtMs: msOrNull(row.resolved_at),
      resolvedBy: row.resolved_by,
      resolution: row.resolution
    }));
  }

  async resolveRiskEvents(
    contestId: string,
    pubkeyHash: string,
    resolvedBy: string,
    resolution: string,
    tx: Queryable
  ): Promise<number> {
    const result = await tx.query(
      `update contest_risk_events
          set resolved_at = now(), resolved_by = $3, resolution = $4
        where contest_id = $1 and participant_pubkey_hash = $2 and resolved_at is null`,
      [contestId, pubkeyHash, resolvedBy, resolution]
    );
    return result.rowCount ?? 0;
  }

  // ── Stats, leaderboard, finalization ──────────────────────────────────────

  async leaderboardPage(
    contestId: string,
    limit: number,
    offset: number
  ): Promise<LeaderboardEntry[]> {
    const result = await this.db.query<{
      pubkey_hash: string;
      display_name: string;
      current_score: string;
      events: string;
      rank: string;
    }>(
      `select p.pubkey_hash, p.display_name, p.current_score,
              coalesce(e.events, 0) as events,
              rank() over (order by p.current_score desc, p.joined_at asc) as rank
         from contest_participants p
         left join (
           select participant_pubkey_hash, count(*) as events
             from contest_engagement_events
            where contest_id = $1 and qualification_status = 'VALID'
            group by participant_pubkey_hash
         ) e on e.participant_pubkey_hash = p.pubkey_hash
        where p.contest_id = $1 and p.eligibility_status <> 'disqualified'
        order by p.current_score desc, p.joined_at asc
        limit $2 offset $3`,
      [contestId, limit, offset]
    );
    return result.rows.map((row) => ({
      rank: num(row.rank),
      pubkeyHash: row.pubkey_hash,
      displayName: row.display_name,
      score: num(row.current_score),
      events: num(row.events)
    }));
  }

  /** Whole board, for rebuilding the Redis cache. */
  async leaderboardSnapshot(
    contestId: string
  ): Promise<Array<{ pubkeyHash: string; score: number }>> {
    const result = await this.db.query<{ pubkey_hash: string; current_score: string }>(
      `select pubkey_hash, current_score from contest_participants
        where contest_id = $1 and eligibility_status <> 'disqualified'`,
      [contestId]
    );
    return result.rows.map((row) => ({
      pubkeyHash: row.pubkey_hash,
      score: num(row.current_score)
    }));
  }

  async rankOf(contestId: string, pubkeyHash: string): Promise<number | null> {
    const result = await this.db.query<{ rank: string }>(
      `select rank from (
         select pubkey_hash,
                rank() over (order by current_score desc, joined_at asc) as rank
           from contest_participants
          where contest_id = $1 and eligibility_status <> 'disqualified'
       ) ranked where pubkey_hash = $2`,
      [contestId, pubkeyHash]
    );
    const row = result.rows[0];
    return row ? num(row.rank) : null;
  }

  /** The score of the participant one rank above, for "points to next rank". */
  async scoreAboveRank(contestId: string, rank: number): Promise<number | null> {
    if (rank <= 1) return null;
    const result = await this.db.query<{ current_score: string }>(
      `select current_score from (
         select current_score,
                rank() over (order by current_score desc, joined_at asc) as rank
           from contest_participants
          where contest_id = $1 and eligibility_status <> 'disqualified'
       ) ranked where rank < $2 order by rank desc limit 1`,
      [contestId, rank]
    );
    const row = result.rows[0];
    return row ? num(row.current_score) : null;
  }

  async pointsInWindow(
    contestId: string,
    pubkeyHash: string,
    sinceMs: number
  ): Promise<number> {
    const result = await this.db.query<{ total: string | null }>(
      `select coalesce(sum(points_awarded), 0) as total from contest_engagement_events
        where contest_id = $1 and participant_pubkey_hash = $2
          and qualification_status = 'VALID' and occurred_at_ms >= $3`,
      [contestId, pubkeyHash, sinceMs]
    );
    return num(result.rows[0]?.total);
  }

  async stats(contestId: string): Promise<ContestStats> {
    const result = await this.db.query<{
      participants: string;
      active_participants: string;
      total_events: string;
      valid_events: string;
      suspicious_events: string;
      rejected_events: string;
      points_awarded: string;
      open_risk_flags: string;
      entry_revenue: string;
    }>(
      `select
         (select count(*) from contest_participants where contest_id = $1) as participants,
         (select count(distinct participant_pubkey_hash) from contest_engagement_events
           where contest_id = $1 and qualification_status = 'VALID') as active_participants,
         (select count(*) from contest_engagement_events where contest_id = $1) as total_events,
         (select count(*) from contest_engagement_events
           where contest_id = $1 and qualification_status = 'VALID') as valid_events,
         (select count(*) from contest_engagement_events
           where contest_id = $1 and qualification_status = 'PENDING_REVIEW') as suspicious_events,
         (select count(*) from contest_engagement_events
           where contest_id = $1 and qualification_status in ('REJECTED', 'REVERSED')) as rejected_events,
         (select coalesce(sum(points_awarded), 0) from contest_engagement_events
           where contest_id = $1 and qualification_status = 'VALID') as points_awarded,
         (select count(*) from contest_risk_events
           where contest_id = $1 and resolved_at is null) as open_risk_flags,
         (select coalesce(sum(amount_minor), 0) from contest_entry_payments
           where contest_id = $1 and status = 'paid') as entry_revenue`,
      [contestId]
    );
    const row = result.rows[0];
    return {
      participants: num(row?.participants),
      activeParticipants: num(row?.active_participants),
      totalEvents: num(row?.total_events),
      validEvents: num(row?.valid_events),
      suspiciousEvents: num(row?.suspicious_events),
      rejectedEvents: num(row?.rejected_events),
      pointsAwarded: num(row?.points_awarded),
      openRiskFlags: num(row?.open_risk_flags),
      entryRevenueMinor: num(row?.entry_revenue)
    };
  }

  /**
   * Freezes the standings: recomputes every final score from the ledger (not
   * from the cached column) and assigns ranks. Disqualified participants are
   * excluded from ranking but keep their row and their evidence.
   */
  async finalizeStandings(contestId: string, tx: Queryable): Promise<void> {
    await tx.query(
      `with rebuilt as (
         select p.pubkey_hash,
                greatest(0, coalesce((
                  select sum(case when l.direction = 'CREDIT' then l.points else -l.points end)
                    from contest_score_ledger l
                   where l.contest_id = p.contest_id
                     and l.participant_pubkey_hash = p.pubkey_hash
                ), 0)) as total
           from contest_participants p
          where p.contest_id = $1
       ), ranked as (
         select r.pubkey_hash, r.total,
                case when p.eligibility_status = 'disqualified' then null else
                  rank() over (
                    partition by (p.eligibility_status = 'disqualified')
                    order by r.total desc, p.joined_at asc
                  )
                end as final_rank
           from rebuilt r
           join contest_participants p
             on p.contest_id = $1 and p.pubkey_hash = r.pubkey_hash
       )
       update contest_participants p
          set final_score = ranked.total,
              current_score = ranked.total,
              final_rank = ranked.final_rank,
              updated_at = now()
         from ranked
        where p.contest_id = $1 and p.pubkey_hash = ranked.pubkey_hash`,
      [contestId]
    );
  }

  async upsertWinners(
    contestId: string,
    topN: number,
    prizeAmountMinor: number,
    prizeCurrency: string,
    tx: Queryable
  ): Promise<void> {
    await tx.query(
      `insert into contest_winners (
         id, contest_id, participant_pubkey_hash, rank, final_score,
         prize_amount_minor, prize_currency, review_status, payout_status,
         created_at, updated_at
       )
       select gen_random_uuid(), $1, pubkey_hash, final_rank, coalesce(final_score, 0),
              case when final_rank = 1 then $3 else 0 end, $4, 'PENDING', 'PENDING',
              now(), now()
         from contest_participants
        where contest_id = $1 and final_rank is not null and final_rank <= $2
       on conflict (contest_id, rank) do update
          set participant_pubkey_hash = excluded.participant_pubkey_hash,
              final_score = excluded.final_score,
              updated_at = now()`,
      [contestId, topN, prizeAmountMinor, prizeCurrency]
    );
  }

  async listWinners(contestId: string): Promise<WinnerRecord[]> {
    const result = await this.db.query<{
      id: string;
      participant_pubkey_hash: string;
      rank: number;
      final_score: string;
      prize_amount_minor: string;
      prize_currency: string;
      review_status: string;
      approved_by: string | null;
      approved_at: Date | null;
      payout_reference: string | null;
      payout_status: string;
      payout_note: string;
    }>(
      `select id, participant_pubkey_hash, rank, final_score, prize_amount_minor,
              prize_currency, review_status, approved_by, approved_at,
              payout_reference, payout_status, payout_note
         from contest_winners where contest_id = $1 order by rank asc`,
      [contestId]
    );
    return result.rows.map((row) => ({
      id: row.id,
      participantPubkeyHash: row.participant_pubkey_hash,
      rank: row.rank,
      finalScore: num(row.final_score),
      prizeAmountMinor: num(row.prize_amount_minor),
      prizeCurrency: row.prize_currency,
      reviewStatus: row.review_status as WinnerRecord["reviewStatus"],
      approvedBy: row.approved_by,
      approvedAtMs: msOrNull(row.approved_at),
      payoutReference: row.payout_reference,
      payoutStatus: row.payout_status as WinnerRecord["payoutStatus"],
      payoutNote: row.payout_note
    }));
  }

  async setWinnerReview(
    contestId: string,
    pubkeyHash: string,
    reviewStatus: "APPROVED" | "REJECTED",
    approvedBy: string,
    tx: Queryable
  ): Promise<number> {
    const result = await tx.query(
      `update contest_winners
          set review_status = $3, approved_by = $4, approved_at = now(), updated_at = now()
        where contest_id = $1 and participant_pubkey_hash = $2`,
      [contestId, pubkeyHash, reviewStatus, approvedBy]
    );
    return result.rowCount ?? 0;
  }

  async setWinnerPayout(
    contestId: string,
    pubkeyHash: string,
    payoutStatus: "PAID" | "FAILED",
    payoutReference: string,
    note: string,
    tx: Queryable
  ): Promise<number> {
    const result = await tx.query(
      `update contest_winners
          set payout_status = $3, payout_reference = $4, payout_note = $5, updated_at = now()
        where contest_id = $1 and participant_pubkey_hash = $2
          and review_status = 'APPROVED'`,
      [contestId, pubkeyHash, payoutStatus, payoutReference, note]
    );
    return result.rowCount ?? 0;
  }

  // ── Entry payments ────────────────────────────────────────────────────────

  async createEntryPayment(input: {
    contestId: string;
    pubkeyHash: string;
    providerSessionId: string;
    amountMinor: number;
    currency: string;
  }): Promise<void> {
    await this.db.query(
      `insert into contest_entry_payments (
         id, contest_id, pubkey_hash, provider, provider_session_id,
         amount_minor, currency, status, created_at, updated_at
       ) values ($1, $2, $3, 'stripe', $4, $5, $6, 'created', now(), now())
       on conflict (provider, provider_session_id) do nothing`,
      [
        randomUUID(),
        input.contestId,
        input.pubkeyHash,
        input.providerSessionId,
        input.amountMinor,
        input.currency
      ]
    );
  }

  /**
   * Marks an entry paid and activates the participant in one transaction.
   * Returns false when the session was already settled, which is what makes a
   * replayed Stripe webhook a no-op rather than a second entry.
   */
  async settleEntryPayment(input: {
    providerSessionId: string;
    contestId: string;
    pubkeyHash: string;
    paymentReference: string | null;
    amountMinor: number;
    currency: string;
    status: "paid" | "failed";
  }): Promise<boolean> {
    return this.db.withTransaction(async (tx) => {
      const updated = await tx.query<{ id: string }>(
        `update contest_entry_payments
            set status = $2, provider_payment_reference = $3, updated_at = now()
          where provider = 'stripe' and provider_session_id = $1 and status = 'created'
          returning id`,
        [input.providerSessionId, input.status, input.paymentReference]
      );
      if (updated.rows.length === 0) {
        // Either already settled, or the session was created by an instance
        // whose insert we never saw. Insert it settled so the payment is on
        // record either way; a conflict means it really was already settled.
        const inserted = await tx.query<{ id: string }>(
          `insert into contest_entry_payments (
             id, contest_id, pubkey_hash, provider, provider_session_id,
             provider_payment_reference, amount_minor, currency, status,
             created_at, updated_at
           ) values ($1, $2, $3, 'stripe', $4, $5, $6, $7, $8, now(), now())
           on conflict (provider, provider_session_id) do nothing
           returning id`,
          [
            randomUUID(),
            input.contestId,
            input.pubkeyHash,
            input.providerSessionId,
            input.paymentReference,
            input.amountMinor,
            input.currency,
            input.status
          ]
        );
        if (inserted.rows.length === 0) return false;
      }

      if (input.status === "paid") {
        await tx.query(
          `update contest_participants
              set payment_status = 'paid',
                  eligibility_status = case
                    when eligibility_status = 'disqualified' then 'disqualified'
                    else 'eligible'
                  end,
                  updated_at = now()
            where contest_id = $1 and pubkey_hash = $2`,
          [input.contestId, input.pubkeyHash]
        );
      } else {
        await tx.query(
          `update contest_participants
              set payment_status = 'failed', eligibility_status = 'pending_payment',
                  updated_at = now()
            where contest_id = $1 and pubkey_hash = $2`,
          [input.contestId, input.pubkeyHash]
        );
      }
      return true;
    });
  }

  // ── Admin audit ───────────────────────────────────────────────────────────

  async audit(
    input: {
      contestId: string | null;
      action: string;
      actorPubkeyHash: string;
      target?: string | undefined;
      before?: unknown;
      after?: unknown;
      reason?: string | undefined;
    },
    tx: Queryable = this.db
  ): Promise<void> {
    await tx.query(
      `insert into contest_admin_audit (
         id, contest_id, action, actor_pubkey_hash, target, before_state,
         after_state, reason, created_at
       ) values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, now())`,
      [
        randomUUID(),
        input.contestId,
        input.action,
        input.actorPubkeyHash,
        input.target ?? null,
        input.before === undefined ? null : JSON.stringify(input.before),
        input.after === undefined ? null : JSON.stringify(input.after),
        input.reason ?? ""
      ]
    );
  }

  async listAudit(
    contestId: string,
    limit: number,
    offset: number
  ): Promise<
    Array<{
      id: string;
      action: string;
      actorPubkeyHash: string;
      target: string | null;
      reason: string;
      createdAtMs: number;
      before: unknown;
      after: unknown;
    }>
  > {
    const result = await this.db.query<{
      id: string;
      action: string;
      actor_pubkey_hash: string;
      target: string | null;
      reason: string;
      created_at: Date;
      before_state: unknown;
      after_state: unknown;
    }>(
      `select id, action, actor_pubkey_hash, target, reason, created_at,
              before_state, after_state
         from contest_admin_audit
        where contest_id = $1
        order by created_at desc limit $2 offset $3`,
      [contestId, limit, offset]
    );
    return result.rows.map((row) => ({
      id: row.id,
      action: row.action,
      actorPubkeyHash: row.actor_pubkey_hash,
      target: row.target,
      reason: row.reason,
      createdAtMs: ms(row.created_at),
      before: row.before_state,
      after: row.after_state
    }));
  }
}
