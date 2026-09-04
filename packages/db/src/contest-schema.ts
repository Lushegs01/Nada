/**
 * Contest domain schema.
 *
 * Money is stored in minor units (kobo for NGN, cents for USD) as bigints.
 * Floating-point money is how prize pools quietly gain and lose a naira, and
 * the entry-fee amounts here round-trip through Stripe, which is integer-only
 * for exactly the same reason.
 *
 * Every timestamp that a rule reasons about (windows, cooldowns, caps) is an
 * epoch-millisecond bigint rather than a `timestamptz`, so scoring arithmetic
 * never depends on the session time zone. Lifecycle timestamps that are only
 * ever read by humans stay `timestamptz`.
 */
export const CONTEST_SCHEMA_SQL = `
-- One contest. Its scoring rules live in contest_rule_versions and are
-- referenced by version, so an active contest can never have its rules
-- silently rewritten underneath the participants who entered under them.
create table if not exists contests (
  id uuid primary key,
  name text not null,
  slug text not null,
  description text not null default '',
  status text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  registration_start_at timestamptz,
  registration_end_at timestamptz,
  entry_fee_minor bigint not null default 0,
  entry_currency text not null default 'NGN',
  prize_amount_minor bigint not null default 0,
  prize_currency text not null default 'NGN',
  max_participants integer,
  rules_version integer not null default 1,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  published_at timestamptz,
  frozen_at timestamptz,
  finalized_at timestamptz,
  cancelled_at timestamptz,
  constraint contests_status_check check (status in (
    'DRAFT','REGISTRATION_OPEN','ACTIVE','FROZEN','UNDER_REVIEW','FINALIZED','CANCELLED'
  )),
  constraint contests_window_check check (end_at > start_at),
  constraint contests_entry_fee_check check (entry_fee_minor >= 0),
  constraint contests_prize_check check (prize_amount_minor >= 0)
);
create unique index if not exists contests_slug_idx on contests(slug);
create index if not exists contests_status_idx on contests(status, start_at desc);

-- Immutable scoring rules, one row per version. Rows are never updated: a
-- rule change on a live contest creates the next version and is audited.
create table if not exists contest_rule_versions (
  contest_id uuid not null references contests(id) on delete cascade,
  version integer not null,
  rules jsonb not null,
  note text not null default '',
  created_by text not null default '',
  created_at timestamptz not null,
  primary key (contest_id, version)
);

-- A participant is an anonymous NADA identity. No real-world identity, no
-- CampOS mapping, no email — the pubkey hash is the whole of it.
create table if not exists contest_participants (
  id uuid primary key,
  contest_id uuid not null references contests(id) on delete cascade,
  pubkey_hash text not null,
  display_name text not null default '',
  joined_at timestamptz not null,
  payment_status text not null default 'not_required',
  eligibility_status text not null default 'eligible',
  risk_status text not null default 'LOW',
  risk_score integer not null default 0,
  current_score bigint not null default 0,
  final_score bigint,
  final_rank integer,
  disqualified_at timestamptz,
  disqualification_reason text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  constraint contest_participants_payment_check check (payment_status in (
    'not_required','pending','paid','failed','refunded'
  )),
  constraint contest_participants_eligibility_check check (eligibility_status in (
    'eligible','pending_payment','ineligible','disqualified'
  )),
  constraint contest_participants_risk_check check (risk_status in (
    'LOW','WATCH','SUSPICIOUS','HIGH_RISK'
  ))
);
create unique index if not exists contest_participants_unique_idx
  on contest_participants(contest_id, pubkey_hash);
-- Serves the Postgres leaderboard read and the rebuild that repopulates Redis.
create index if not exists contest_participants_board_idx
  on contest_participants(contest_id, current_score desc, joined_at asc);
create index if not exists contest_participants_risk_idx
  on contest_participants(contest_id, risk_score desc);

-- Immutable engagement ledger. A row is written for every qualifying
-- interaction, including the ones that score nothing: a rejected event is
-- evidence, and deleting it would destroy the only record of why a score is
-- what it is.
create table if not exists contest_engagement_events (
  id uuid primary key,
  contest_id uuid not null references contests(id) on delete cascade,
  participant_pubkey_hash text not null,
  actor_pubkey_hash text not null,
  event_type text not null,
  source_entity_type text not null,
  source_entity_id text not null,
  points_awarded bigint not null default 0,
  qualification_status text not null default 'PENDING',
  rejection_reason text,
  risk_score integer not null default 0,
  rules_version integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at_ms bigint not null,
  created_at timestamptz not null,
  processed_at timestamptz,
  -- Deterministic across retries, reconnects, worker restarts and the
  -- reconciliation sweep. This unique index is the whole idempotency story:
  -- an event that has already been recorded cannot be recorded again, so it
  -- cannot be scored again.
  idempotency_key text not null,
  constraint contest_engagement_events_status_check check (qualification_status in (
    'PENDING','VALID','PENDING_REVIEW','REJECTED','REVERSED'
  ))
);
create unique index if not exists contest_engagement_events_idem_idx
  on contest_engagement_events(idempotency_key);
create index if not exists contest_engagement_events_participant_idx
  on contest_engagement_events(contest_id, participant_pubkey_hash, occurred_at_ms desc);
create index if not exists contest_engagement_events_actor_idx
  on contest_engagement_events(contest_id, actor_pubkey_hash, occurred_at_ms desc);
create index if not exists contest_engagement_events_source_idx
  on contest_engagement_events(contest_id, source_entity_type, source_entity_id);
-- Drives the pending-event sweeper and the admin event feed.
create index if not exists contest_engagement_events_status_idx
  on contest_engagement_events(contest_id, qualification_status, created_at);
-- Serves the per-actor/participant pair caps evaluated on every scoring pass.
create index if not exists contest_engagement_events_pair_idx
  on contest_engagement_events(contest_id, participant_pubkey_hash, actor_pubkey_hash, occurred_at_ms desc);

-- Double-entry score ledger. current_score on the participant row is a cache;
-- this table is the only thing that can explain a score, and finalization
-- recomputes from it rather than trusting the cache.
create table if not exists contest_score_ledger (
  id uuid primary key,
  contest_id uuid not null references contests(id) on delete cascade,
  participant_pubkey_hash text not null,
  event_id uuid,
  points bigint not null,
  direction text not null,
  category text not null,
  reason text not null default '',
  created_by text,
  created_at timestamptz not null,
  constraint contest_score_ledger_direction_check check (direction in ('CREDIT','DEBIT')),
  constraint contest_score_ledger_points_check check (points >= 0)
);
create index if not exists contest_score_ledger_participant_idx
  on contest_score_ledger(contest_id, participant_pubkey_hash, created_at);
-- At most one credit and one debit per engagement event: replaying a reversal
-- cannot subtract the same points twice.
create unique index if not exists contest_score_ledger_event_direction_idx
  on contest_score_ledger(event_id, direction) where event_id is not null;

-- Fraud signals. Evidence is preserved rather than acted on destructively:
-- a flag reduces or withholds points and surfaces for review, it does not
-- delete the underlying event.
create table if not exists contest_risk_events (
  id uuid primary key,
  contest_id uuid not null references contests(id) on delete cascade,
  participant_pubkey_hash text not null,
  actor_pubkey_hash text,
  event_id uuid,
  risk_type text not null,
  severity text not null,
  score integer not null default 0,
  evidence jsonb not null default '{}'::jsonb,
  dedupe_key text not null,
  created_at timestamptz not null,
  resolved_at timestamptz,
  resolved_by text,
  resolution text,
  constraint contest_risk_events_severity_check check (severity in ('LOW','MEDIUM','HIGH'))
);
create unique index if not exists contest_risk_events_dedupe_idx
  on contest_risk_events(contest_id, participant_pubkey_hash, risk_type, dedupe_key);
create index if not exists contest_risk_events_participant_idx
  on contest_risk_events(contest_id, participant_pubkey_hash, created_at desc);
create index if not exists contest_risk_events_open_idx
  on contest_risk_events(contest_id, created_at desc) where resolved_at is null;

-- Winners are declared by a human, never by the leaderboard alone.
create table if not exists contest_winners (
  id uuid primary key,
  contest_id uuid not null references contests(id) on delete cascade,
  participant_pubkey_hash text not null,
  rank integer not null,
  final_score bigint not null,
  prize_amount_minor bigint not null default 0,
  prize_currency text not null default 'NGN',
  review_status text not null default 'PENDING',
  approved_by text,
  approved_at timestamptz,
  payout_reference text,
  payout_status text not null default 'PENDING',
  payout_note text not null default '',
  created_at timestamptz not null,
  updated_at timestamptz not null,
  constraint contest_winners_review_check check (review_status in ('PENDING','APPROVED','REJECTED')),
  constraint contest_winners_payout_check check (payout_status in ('PENDING','PAID','FAILED'))
);
create unique index if not exists contest_winners_rank_idx on contest_winners(contest_id, rank);
create index if not exists contest_winners_participant_idx
  on contest_winners(contest_id, participant_pubkey_hash);

-- Entry-fee payments. The provider session id is unique, so a replayed
-- webhook resolves to the row it already wrote instead of a second entry.
create table if not exists contest_entry_payments (
  id uuid primary key,
  contest_id uuid not null references contests(id) on delete cascade,
  pubkey_hash text not null,
  provider text not null default 'stripe',
  provider_session_id text not null,
  provider_payment_reference text,
  amount_minor bigint not null default 0,
  currency text not null default 'NGN',
  status text not null default 'created',
  created_at timestamptz not null,
  updated_at timestamptz not null,
  constraint contest_entry_payments_status_check check (status in (
    'created','paid','failed','refunded'
  ))
);
create unique index if not exists contest_entry_payments_session_idx
  on contest_entry_payments(provider, provider_session_id);
create index if not exists contest_entry_payments_participant_idx
  on contest_entry_payments(contest_id, pubkey_hash, created_at desc);

-- Every privileged mutation, with the state it changed. There are no silent
-- administrative writes: the routes that mutate a contest write here in the
-- same transaction as the change itself.
create table if not exists contest_admin_audit (
  id uuid primary key,
  contest_id uuid,
  action text not null,
  actor_pubkey_hash text not null,
  target text,
  before_state jsonb,
  after_state jsonb,
  reason text not null default '',
  created_at timestamptz not null
);
create index if not exists contest_admin_audit_contest_idx
  on contest_admin_audit(contest_id, created_at desc);
create index if not exists contest_admin_audit_actor_idx
  on contest_admin_audit(actor_pubkey_hash, created_at desc);
`;
