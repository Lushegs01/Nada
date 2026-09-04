# NADA

NADA is an anonymous messaging PWA. Identity is an Ed25519 keypair generated
on-device from a 12-word BIP39 seed phrase; there is no account, phone number,
or email. Contacts, conversations and groups live in IndexedDB. A Fastify relay
routes opaque envelopes by public-key hash.

Messages are encrypted on the client. Direct messages are sealed to the
recipient's key and signed inside the sealed box; group messages and status
updates use a per-epoch symmetric key distributed as one sealed copy per member.
The relay cannot read any of it.

Direct messages are forward-secret where both sides support it: each identity
publishes X3DH-style prekeys, and the one-time prekey a message consumed is
deleted on receipt, so that message stops being decryptable by anyone —
including its recipient, and including anyone who later obtains the identity
key. Where the recipient has published no prekeys, the message falls back to a
sealed box, which is confidential but not forward-secret.

What that does **not** cover, stated plainly because the difference matters:

- **No post-compromise security.** There is no ratchet. An attacker who takes a
  device's current prekey state reads until those keys rotate.
- **No metadata privacy.** The relay sees who talks to whom and when, because
  it routes on exactly that.
- **No IP anonymity.** A browser PWA does not control network routing.
- **An invite link carries the group key** — the link is the group credential.
  "Reset group key" mints a new epoch sealed to current members only, which is
  what revokes a leaked link.
- **Forward secrecy costs recoverability.** Prekey private halves are not
  derived from the seed phrase, so an identity restored on a new device cannot
  open messages queued for the old one. That is the property working, not a
  defect.

`docs/threat-model.md` is the full version. Do not describe NADA as
Signal-equivalent: it is confidential against the relay, not forward-secret.

## Setup

```bash
corepack enable
pnpm install
pnpm dev
```

Required environment values:

```bash
NEXT_PUBLIC_RELAY_URL=<relay host or websocket URL>
ALLOWED_ORIGIN=<web host or origin>
PORT=<relay port supplied by the platform>
PLAYWRIGHT_BASE_URL=<running web app origin for E2E tests>
REDIS_URL=<Redis URL; required in production>
RELAY_QUEUE_TTL_SECONDS=<optional encrypted relay queue TTL>
WEB_PORT=<local web container port>
RELAY_PORT=<local relay container port>
```

See `.env.example` for the full set, including object storage
(`MEDIA_S3_*`), web push (`VAPID_*`), and rate-limit tuning.

`REDIS_URL` is optional locally but required in production: it backs the
offline envelope queue, shared rate-limit counters, and the pub/sub channels
that let one relay instance deliver to a socket held by another. `GET /health`
reports which backends are actually wired up.

## Commands

```bash
pnpm build
pnpm typecheck
pnpm test
pnpm --filter web test:e2e
```

`pnpm --filter web test:e2e` runs the browser journey against a running app:

```bash
pnpm --filter web build && pnpm --filter web start &
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 pnpm --filter web test:e2e
```

It skips when `PLAYWRIGHT_BASE_URL` is unset. Set `PLAYWRIGHT_CHROMIUM_PATH`
when the environment ships its own Chromium rather than the build Playwright
downloads. The suite runs on a desktop and a mobile viewport — NADA is
phone-first, so a layout that only works on a desktop is a broken product.

`pnpm --filter relay loadtest` drives the relay with authenticated sockets and
reports latency percentiles; see `docs/load-testing.md`.

The contest engine's integration and security suites need a real PostgreSQL —
the guarantees under test are SQL guarantees (unique indexes for idempotency,
row locks for caps, window functions for ranks), and a mock would only assert
that the mock behaves. Set `TEST_DATABASE_URL` to a database the test process
may create and drop databases on; CI runs a `postgres:16-alpine` service so
they execute on every pull request. Without it they skip.

```bash
TEST_DATABASE_URL=postgres://postgres@localhost:5432/postgres pnpm test
```

## Engagement contests

NADA runs recurring engagement contests with real prize money. The engine is
backend-controlled and event-driven: every qualifying interaction the relay
already authenticates becomes an immutable engagement event, a double-entry
ledger records what it was worth, and every number that decides a prize is
recomputed from that ledger rather than read from a cache. Scoring runs off the
request path and cannot break messaging or the feed.

See `docs/contest-engine.md` for the architecture, scoring model, anti-cheat
model, API, environment variables and setup.

## Deployment

Render deploys from `render.yaml`:

- `app-web`: Next.js PWA
- `app-relay`: Fastify WebSocket relay (multiple instances)
- `nada-redis`: shared Redis
- `nada-db`: managed PostgreSQL

The web service receives `NEXT_PUBLIC_RELAY_URL` from the relay service host.
The relay receives `ALLOWED_ORIGIN` from the web service host.

The relay scales horizontally, but only with Redis configured — socket presence
is shared through Redis pub/sub. Raising `numInstances` without `REDIS_URL`
silently breaks cross-instance delivery. See `docs/production-deployment.md`.

### CampOS integration

NADA accepts CampOS launches at `GET /sso/callback`. To enable the hand-off:

1. Set `CAMPOS_SSO_SECRET` on the NADA web service to the same value as CampOS
   Core's `SSO_JWT_SECRET_NADA` (or its shared `SSO_JWT_SECRET` fallback).
2. Set `CAMPOS_CORE_URL` to the public HTTPS origin of CampOS Core. NADA uses it
   server-side to exchange the browser's single-use authorization code.
3. Set `SSO_URL_NADA` on CampOS Core to NADA's public web origin. This
   environment override takes precedence over the stored module URL, so a
   production database re-seed is neither required nor recommended.
4. Ensure the existing `nada` module registration is active and grants the
   canonical student and institution-administrator roles. Apply Core's
   `20260728200000_module_admin_sso` migration for existing registrations.

The callback consumes a short-lived authorization code server-side and verifies
the returned CampOS token, including its signed `launchContext`. Student
launches continue into the anonymous app. Institution-owner/admin launches
receive a short-lived, HttpOnly NADA admin session and land at `/admin`.
The admin surface deliberately exposes connection and privacy-boundary state,
not anonymous Echoes, conversations, device keys, or student identity mappings.

Every hand-off requires both a non-empty institution ID and institution slug.
NADA remains intentionally
global and cross-institution: it validates that CampOS attributed the user
to an institution, but does not compare that institution with a NADA tenant or
restrict the standalone access model. Identity claims never enter the browser
URL and are not bound to NADA's anonymous local keypair/session; after the
handoff, the normal on-device anonymous identity remains authoritative.

`HEAD /api/health` is a credential-free process probe used by CampOS to overlap
a possible NADA web-service cold start with Core's authorization work. It does
not contact the relay, anonymous local storage, or NADA's database.

## Status

Working end to end: anonymous identity and seed-phrase recovery, invite links
and QR sharing, encrypted direct and group messaging with offline queueing and
reconnect replay, replies, reactions, edits, unsend, disappearing timers,
search, encrypted media, vanishing statuses shared with a chosen audience, the
public Whispers feed with threads and profiles, notifications, web push, PWA
installability, WebRTC calling, Stripe subscriptions, and CampOS SSO.

Known gaps, in priority order:

1. **No post-compromise security.** Prekeys give forward secrecy but there is
   no ratchet, so a device compromised *now* stays readable until its prekeys
   rotate. Closing this means a Double Ratchet or the Signal adapter.
2. **Group fan-out is sender-driven.** The relay holds no group membership, so
   it delivers to whatever recipient list a sender supplies. The client only
   admits a group it was sealed a key for, and the fan-out budget is charged
   per delivery, but this is not membership control.
3. **Group media downloads.** Direct media is authorized to its two parties;
   group media falls back to "any authenticated identity that knows the object
   id", because the relay cannot check membership it does not hold.
4. **`style-src` keeps `unsafe-inline`.** React writes inline style attributes
   throughout, and there is no nonce mechanism for those. `script-src` is
   nonced.
5. **Load testing.** Measured single-instance (`docs/load-testing.md`); the
   multi-instance path with Redis in the loop has not been driven at scale.
