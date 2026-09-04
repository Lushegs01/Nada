# NADA Engagement & Contest Engine

A backend-controlled, event-driven scoring system for recurring engagement
contests with real prize money. It treats the leaderboard as a financial record
rather than a UI feature: every point can be traced to the authenticated action
that earned it, and every number that decides a prize is recomputed from the
ledger rather than read from a cache.

## Architecture

```
NADA user action (Echo, Reflection, reaction, ripple, follow)
   ↓  relay already verified an Ed25519 identity proof for this write
Whisper route calls contest.emit(...)          ← returns immediately, cannot throw
   ↓
Bounded in-process queue (per relay instance)
   ↓
Durable INSERT: contest_engagement_events (PENDING, unique idempotency key)
   ↓
Scoring transaction (participant row locked FOR UPDATE)
   eligibility → exclusions → risk → caps → decay
   ↓
contest_score_ledger (CREDIT)  +  participants.current_score (cache)
   ↓
Redis sorted set (leaderboard acceleration)      Postgres (source of truth)
   ↓
Leaderboard reads, participant dashboard, admin review
   ↓
FROZEN → reconcile + fraud sweep → UNDER_REVIEW → human finalize
   ↓
contest_winners → approval → recorded payout
```

Three properties hold this together:

**Nothing the client says influences a score.** The client sends an
authenticated action. Points, rank, eligibility, contest status and the
timestamps scoring depends on are all decided by the relay. Posting
`{"points": 100}` to any endpoint changes nothing — the field is not in any
schema and no code path reads one.

**Contest failure cannot become product failure.** `emit` and `reverse` return
`void` synchronously and swallow everything. If the queue is full, the database
is down, or the scoring logic throws, the Whisper write has already succeeded
and the user sees nothing. That is the whole reason scoring is asynchronous.

**Postgres is the only source of truth.** Redis holds a sorted set per contest
so a top-N read is `O(log n + limit)` instead of an ordered scan on every poll.
It is rebuilt from Postgres whenever it is cold, and every read path falls back
to Postgres when Redis is unavailable.

## Recovery

Asynchronous scoring can lose work. Three mechanisms recover it, in increasing
order of thoroughness:

1. **Durable-then-score.** The event row is written `PENDING` before any scoring
   happens, so a crash mid-pass leaves work to resume rather than a point
   silently never awarded.
2. **The sweeper.** Every 60s each instance re-processes `PENDING` rows older
   than 30s, using `FOR UPDATE SKIP LOCKED` so instances do not collide. The
   same pass advances contests past their own deadlines — in particular
   auto-freezing at the end time, which is what actually stops scoring.
3. **Reconciliation.** `POST /api/v1/contests/admin/:id/reconcile` replays the
   contest's whole window from the Whisper tables — the product's own durable
   record of what people did — and records anything missing. Every derived event
   carries the same deterministic key it would have had when it happened, so a
   replay of an already-scored window is a no-op. **A contest cannot be
   finalized without passing through this step.**

## Idempotency

One unique index does the work:

```sql
create unique index contest_engagement_events_idem_idx
  on contest_engagement_events(idempotency_key);
```

The key is `sha256(contestId | eventType | sourceEntityType | sourceEntityId |
participant | actor)`. Every retry path — an HTTP retry, a WebSocket reconnect,
a worker restart, a second relay instance, the reconciliation sweep — produces
the same key for the same real-world interaction. It deliberately includes both
parties: one Echo legitimately earns its author points from many different
reactors, and each of those is a distinct event.

Reversals are protected the same way, by a partial unique index on
`(event_id, direction)`: at most one credit and at most one debit per event, so
a replayed reversal cannot subtract the same points twice.

## Scoring model

Rules are **data, not code**. Nothing in the application hard-codes a point
value; a future contest changes behaviour by shipping a new rules version.
Rules are immutable per version, and changing them on a live contest appends the
next version and is audited — past events keep pointing at the rules they were
actually scored under.

Default ruleset (`apps/relay/src/contest/rules.ts`):

| Signal | Points |
| --- | --- |
| Echo created | +10 |
| Reflection written | +4 |
| Echo rippled | +1 |
| Reflection received | +5 |
| Ripple received | +3 |
| Reaction received | +2 |
| Reflection liked | +1 |
| New Ghost (follower) | +4 |
| Daily challenge | +10 |
| Weekly challenge | +25 |

The shape matters more than the magnitudes: **receiving** engagement is worth
more than **performing** an action, and every earning path is capped, so "press
the button more times" converges on nothing well before "write something people
respond to" does.

An event's award can only be reduced as it walks the pipeline, and every
reduction is recorded with its reason:

- **Cooldown** — a minimum gap between two events of the same type by one actor.
- **Per-type daily count cap** — at most N of each kind per participant per UTC day.
- **Diminishing returns** — after 3 interactions with the same ghost inside 24h,
  each further one is worth 50% of the last.
- **Per-pair cap** — one actor may generate at most 30 points for one participant
  per 24h. Decay is the slope; this is the wall.
- **Per-content cap** — a single Echo can never be worth more than 120 points in
  total, however viral.
- **Daily points cap** — at most 500 points per participant per UTC day.
- **Risk multiplier** — see below.

Challenges are **derived, never claimed**. A client cannot tell the server it
finished one; the server counts the qualifying events it already validated and
decides for itself, once per period, keyed by a period-scoped idempotency key.

### What deliberately does not score

- **Direct and group messages.** Bodies are end-to-end encrypted, so the relay
  cannot distinguish a conversation from a script. Awarding points per message
  would reward spam and require trusting a self-report.
- **Community activity.** NADA's communities are client-side state with no
  server record. The `COMMUNITY_ACTIVITY` rule key exists and is configurable,
  but nothing emits it and it therefore scores nothing today. When communities
  gain a server-side record, wiring the emitter is the only change needed.

## Anti-cheat model

A risk engine, not a rule list. **No single rule bans anyone**: signals
accumulate into a 0–100 score, the score maps onto a band, and the band decides
whether points are paid, reduced, or withheld for review.

| Band | Score | Effect (configurable) |
| --- | --- | --- |
| LOW | 0–20 | full value |
| WATCH | 21–50 | full value, visible to admins |
| SUSPICIOUS | 51–80 | 50% value |
| HIGH_RISK | 81–100 | withheld, event held `PENDING_REVIEW` |

Per-event signals: `SELF_INTERACTION`, `RAPID_INTERACTION`, `BURST_ACTIVITY`,
`REPEATED_ACTOR`, `REPEATED_TARGET`, `AUTOMATION_PATTERN`,
`NEW_ACCOUNT_FARMING`. Aggregate signal, run at freeze and on demand:
`ENGAGEMENT_CLUSTER` — a participant whose points come overwhelmingly from one
other identity, which is the signature of a two-account ring and is invisible in
any single event.

`AUTOMATION_PATTERN` looks for a metronome: consecutive interactions whose
inter-arrival gaps barely vary. Unlike a raw rate limit it does not punish
someone who simply reads fast.

**Nothing here destroys evidence.** A suspicious event keeps its row and gains a
`contest_risk_events` record naming exactly what was seen, with the numbers that
tripped it. Statuses are `VALID | PENDING_REVIEW | REJECTED | REVERSED` — never
a delete. An admin reviewing a disqualification reads the detector's working,
not its verdict, and can release held events back into scoring.

`SUSPICIOUS_NETWORK` is **not** implemented. It would require logging client
IPs, which the relay does not do and must not start doing for a leaderboard.

## Redis / Postgres strategy

| Concern | Store | Why |
| --- | --- | --- |
| Contests, rules, participants, events, ledger, risk, winners, payments, audit | Postgres | Source of truth; everything is recomputable from it |
| Leaderboard top-N | Redis sorted set, rebuilt from Postgres | Avoids an ordered scan per poll |
| Member display names and event counts | Redis hash beside the sorted set | Renders a page without a second query |
| A participant's own rank and gap | Postgres | The number they will argue about; one indexed window query |

Rebuilds stage into temporary keys and `RENAME` into place, so readers never
observe a half-filled board. Redis failure is caught and logged at every call
site; the read falls back to `contest_participants` ordered by score.

One honest limitation: a sorted set breaks ties lexicographically by member,
while the authoritative ranking breaks them by who joined first. Displayed ranks
can therefore differ between equal scores. Everything that decides money —
`finalizeStandings`, the winners table — is computed in Postgres, where the
tiebreak is correct.

## Payments

Contest entry fees ride the relay's **existing** Stripe webhook rather than a
second endpoint with a second signature check and a second idempotency story.
The event is already claimed exactly once by `claimStripeEvent`; contest-entry
sessions are routed to the contest engine by a `kind: "contest_entry"` metadata
tag.

```
join (paid contest) → participant row created as pending_payment
                    → Stripe Checkout session (mode: payment)
                    → contest_entry_payments row (unique per session id)
   browser redirect ─────────────────────────────────────────► grants nothing
                    → Stripe webhook, signature verified
                    → settleEntryPayment: payment paid + participant eligible
```

The browser's success redirect is a UI convenience. A client that forges it
lands on a page saying they are in, while the server still has them as
`pending_payment` and refuses to score them. Return URLs are validated against
the relay's allowed origin, so Checkout cannot be used as an open redirect.

Payouts are **recorded, not initiated**. NADA holds no payout rail; inventing
one would be worse than a durable record of the transfer an operator actually
made. A payout can only be recorded against a winner an admin has approved.

## Contest finalization

```
ACTIVE ──(deadline, automatic)──► FROZEN ──► UNDER_REVIEW ──► FINALIZED
                                     │  reconcile + fraud sweep
                                     └────────────► CANCELLED
```

The state machine is enforced server-side; `ACTIVE → FINALIZED` is not a legal
transition and no admin can make it one. Finalization recomputes every final
score from the ledger — not from the cached `current_score` — assigns ranks with
`joined_at` as the tiebreak, and stages `contest_winners` rows as `PENDING`.
A human then approves or rejects each one, and only an approved winner can have
a payout recorded.

## Privacy

Public surfaces expose only the anonymous display name and the pubkey hash that
is already public on every Echo. Never exposed anywhere: institution, CampOS
identity, email, private key material, message content, or fraud evidence.

The published rules deliberately omit the fraud detector's thresholds —
publishing the exact rate a detector fires at is publishing how to stay under
it. Participants see *that* an award was reduced and *which limit* did it; the
risk score and the evidence stay on the admin side.

Admin auth is the same Ed25519 identity proof as every other privileged call,
allow-listed by pubkey hash. There is no second identity system, no admin
password, and no session cookie crossing a service boundary. Each proof binds
the action and the contest, so a proof captured while freezing one contest
cannot be replayed to finalize another. An unauthorised admin call and an
unknown-identity admin call return identical responses, so the endpoint is not
an admin-key oracle.

## Database migrations

Applied at boot, once each, recorded in `schema_migrations`, each inside its own
transaction behind a Postgres advisory lock so concurrent instance starts do not
race.

| id | Contents |
| --- | --- |
| `0001_baseline` | Everything that predates the contest engine (users, subscriptions, relay queue, prekeys, statuses, whispers, notifications, Stripe events) |
| `0002_contest_domain` | `contests`, `contest_rule_versions`, `contest_participants`, `contest_engagement_events`, `contest_score_ledger`, `contest_risk_events`, `contest_winners`, `contest_entry_payments`, `contest_admin_audit` |

Money is stored in **minor units** (kobo, cents) as bigints. Floating-point
money is how a prize pool quietly gains and loses a naira, and the amounts
round-trip through Stripe, which is integer-only for the same reason.

Indexes are built from the actual query patterns: the leaderboard read, the
per-actor/participant pair cap evaluated on every scoring pass, the source-entity
cap, the pending-event sweeper, and the admin event feed.

## API

### Participant

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/api/v1/contests` | public |
| GET | `/api/v1/contests/:idOrSlug` | public |
| GET | `/api/v1/contests/:idOrSlug/rules` | public |
| GET | `/api/v1/contests/:idOrSlug/leaderboard?limit&offset` | public |
| POST | `/api/v1/contests/:id/join` | proof (`contest-join`) |
| POST | `/api/v1/contests/:id/me` | proof (`contest-me`) |
| POST | `/api/v1/contests/:id/me/activity` | proof (`contest-activity`) |
| GET | `/api/v1/contests/metrics` | bearer token |

### Admin — all proof (`contest-admin`, bound to `<action>:<contestId>`)

`whoami` · `list` · `create` · `:id/update` · `:id/publish` · `:id/activate` ·
`:id/freeze` · `:id/reconcile` · `:id/finalize` · `:id/cancel` · `:id/overview` ·
`:id/participants` · `:id/participant` · `:id/events` · `:id/risk` ·
`:id/review` · `:id/winner/approve` · `:id/payout` · `:id/audit`

All under `/api/v1/contests/admin/`.

## Frontend

| Route / surface | Purpose |
| --- | --- |
| Contest tab (in-app) | Hero, countdown, standings, "how did I get this score?", itemised activity, rules |
| `/contest` | Shareable read-only page: contest, rules, anonymous leaderboard |
| `/admin/contests` | Operator console: overview, lifecycle, participants, investigation, risk, winners, audit, contest creation |

Components: `src/components/contest/ContestScreen.tsx`,
`ContestPublicView.tsx`, `ContestAdminConsole.tsx`, `ContestPieces.tsx`.
Clients: `src/lib/contest.ts`, `src/lib/contest-admin.ts`.

## Observability

`GET /api/v1/contests/metrics` (bearer-gated, aggregate only):

```
contest_events_received_total      contest_events_processed_total
contest_events_rejected_total      contest_events_held_total
contest_events_reversed_total      contest_events_dropped_total
contest_points_awarded_total       contest_fraud_flags_total
contest_payment_success_total      contest_payout_success_total
contest_payout_failed_total        contest_queue_depth
```

plus rejection reasons and fraud flags broken down by cause. Structured logs
cover migrations applied, contest status changes, reconciliation results,
participant review, winner review, payout recording, and every dropped or
failed job.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Without it the contest engine is unavailable and its routes answer 503 |
| `REDIS_URL` | recommended | Leaderboard acceleration; absent means Postgres-only reads |
| `CONTEST_ADMIN_PUBKEY_HASHES` | to administer | Comma-separated allow-list of admin pubkey hashes. Empty disables contest administration |
| `CONTEST_METRICS_TOKEN` | optional | Bearer token for the metrics endpoint. Unset ⇒ 404 |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | for paid entry | Reuses the existing subscription webhook |
| `ALLOWED_ORIGIN` | yes | Also constrains Checkout return URLs |
| `TEST_DATABASE_URL` | tests only | A database the test process may create/drop databases on |

## Local setup

```bash
# 1. Postgres and Redis
docker compose up -d postgres redis

# 2. Relay
cd apps/relay
DATABASE_URL=postgres://nada:nada@localhost:5432/nada \
REDIS_URL=redis://localhost:6379 \
ALLOWED_ORIGIN=http://localhost:3000 \
PORT=8080 \
CONTEST_ADMIN_PUBKEY_HASHES=<your identity's pubkey hash> \
pnpm dev

# 3. Web
cd apps/web
NEXT_PUBLIC_RELAY_URL=http://localhost:8080 pnpm dev

# 4. Create a contest
#    Open http://localhost:3000/admin/contests with the admin identity
#    unlocked on that device, create a draft, then: open registration →
#    start scoring.
```

Migrations apply on relay boot; there is no separate migrate step.

To run the integration suites:

```bash
TEST_DATABASE_URL=postgres://postgres@localhost:5432/postgres pnpm test
```

## Tests

| Suite | Covers |
| --- | --- |
| `apps/relay/tests/contest-rules.test.ts` | Rule parsing and defaults, point ordering, diminishing returns, risk bands, automation detection, event classification, UTC period boundaries, idempotency-key derivation, state-machine matrix |
| `apps/relay/tests/contest-engine.test.ts` | Event → score → ledger, duplicate suppression, ledger reconstruction, self-interaction, non-participants, window bounds, decay, pair cap, new-identity discount, per-type daily cap, cooldown, per-content cap, reversal on deletion, double-reversal, challenges, risk hold, ranking, crash recovery, reconciliation idempotence, disqualification, held-event release, freeze→review→finalize, ledger-derived final scores, payout gating, webhook replay, unpaid entry, audit, migration idempotence |
| `apps/relay/tests/contest-security.test.ts` | Missing/forged/replayed/mis-bound proofs, cross-identity reads, client-supplied points and ranks, leaderboard field exposure, threshold leakage, admin allow-list, admin proof binding, illegal transitions, metrics gating, closed registration, admin-key oracle |
| `apps/web/tests/contest.test.ts` | Money formatting in minor units, countdown arithmetic, registration window, labels |
| `apps/web/tests/contest.spec.ts` | Contest tab reachable on desktop and mobile, public page without an identity, admin console refusing an unverifiable identity |

The engine suites need a real PostgreSQL — the guarantees under test *are* SQL
guarantees, and a mock would only assert that the mock behaves. CI runs a
`postgres:16-alpine` service so they execute on every pull request; without
`TEST_DATABASE_URL` they skip.

## Known limitations

- **Ledger tie ordering in Redis.** Displayed ranks can differ from final ranks
  between equal scores. Final ranking is Postgres-computed and correct.
- **No payout integration.** Payouts are recorded, not executed.
- **Stripe currency support.** Entry-fee currency is configurable, but Stripe
  must actually support it in the operator's account; NGN in particular is not
  available in every Stripe region.
- **Community activity does not score** until communities gain a server-side
  record.
- **Single-region assumptions.** The scoring worker is per-instance and bounded;
  a sustained burst beyond `MAX_QUEUE_DEPTH` (20,000) sheds the oldest jobs, and
  reconciliation is what recovers them. It has not been load-tested at that
  volume.
- **Legal compliance is not asserted.** The rules page states the mechanics; it
  does not claim the contest is lawful in any particular jurisdiction. That
  determination is the operator's.
