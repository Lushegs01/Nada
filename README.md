# NADA

NADA is an anonymous messaging PWA. Identity is an Ed25519 keypair generated
on-device from a 12-word BIP39 seed phrase; there is no account, phone number,
or email. Contacts, conversations and groups live in IndexedDB. A Fastify relay
routes opaque envelopes by public-key hash.

Messages are encrypted on the client. Direct messages are sealed to the
recipient's key and signed inside the sealed box; group messages and status
updates use a per-epoch symmetric key distributed as one sealed copy per member.
The relay cannot read any of it.

What that does **not** cover, stated plainly because the difference matters:

- **No forward secrecy.** There is no ratchet, so an identity private key
  obtained later decrypts everything ever sent to it.
- **No metadata privacy.** The relay sees who talks to whom and when, because
  it routes on exactly that.
- **No IP anonymity.** A browser PWA does not control network routing.
- **Groups do not rotate keys on membership change,** and an invite link carries
  the group key — the link is the group credential.

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

1. **No forward secrecy.** The Signal adapter in `@nada/crypto` is loadable but
   not wired into sessions; until it is, compromise of an identity key is
   retroactive.
2. **Group key rotation.** Removing a member does not rotate the group key.
3. **Media authorization.** Uploads require an identity proof, but a download
   only requires the object id. Objects are client-encrypted, so this is an
   unauthenticated read of ciphertext rather than a disclosure.
4. **CSP `unsafe-inline`.** Required by Next.js hydration until nonces are
   wired through middleware.
5. **Load testing.** The relay has correctness tests for its scaling paths but
   has not been driven at institution scale.
