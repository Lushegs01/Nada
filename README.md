# NADA

NADA is an anonymous messaging PWA foundation. Phase 1 proves local identity,
local contacts, invite links, QR sharing, IndexedDB storage, PWA installability,
and an opaque WebSocket relay.

Phase 1 is not production anonymity. Mock message encryption is labeled in code
and UI as `// ⚠️ MVP_ONLY — replace before production`.

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
REDIS_URL=<optional Redis URL for relay queue>
RELAY_QUEUE_TTL_SECONDS=<optional encrypted relay queue TTL>
WEB_PORT=<local web container port>
RELAY_PORT=<local relay container port>
```

## Commands

```bash
pnpm build
pnpm typecheck
pnpm test
pnpm --filter web test:e2e
```

`pnpm --filter web test:e2e` skips safely unless `PLAYWRIGHT_BASE_URL` is set.

## Deployment

Render must deploy two separate services from `render.yaml`:

- `app-web`: Next.js PWA
- `app-relay`: Fastify WebSocket relay

The web service receives `NEXT_PUBLIC_RELAY_URL` from the relay service host.
The relay receives `ALLOWED_ORIGIN` from the web service host.

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
   `student` role. Update it through CampOS module administration if needed.

The callback consumes a short-lived authorization code server-side and verifies
the returned CampOS token. A CampOS launch must be a student hand-off with both
a non-empty institution ID and institution slug. NADA remains intentionally
global and cross-institution: it validates that CampOS attributed the student
to an institution, but does not compare that institution with a NADA tenant or
restrict the standalone access model. Identity claims never enter the browser
URL and are not bound to NADA's anonymous local keypair/session; after the
handoff, the normal on-device anonymous identity remains authoritative.

## Phase 2 Status

Phase 2 adds production envelope schemas, a libsodium sealed-box scaffold,
Redis-backed relay queue support, client-side AES-GCM file encryption, and blind
upload request routes. Signal protocol integration remains isolated behind the
adapter boundary until the dependency can be installed, licensed, and verified.

## Phase 3 Status

Phase 3 adds local groups, group sender-key scaffolding, relay group fan-out,
message replies, mentions, search, edit/unsend, disappearing timers, and a
WebRTC call surface with Insertable Streams detection. Production groups still
need audited Signal Sender Keys or MLS, and production calls still need TURN/SFU
privacy hardening.
