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
