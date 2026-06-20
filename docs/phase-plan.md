# Phase Plan

## Phase 1

- pnpm and Turborepo monorepo.
- Next.js App Router PWA shell.
- Tailwind design tokens and shared UI package.
- Local Ed25519 identity generation.
- Seed phrase onboarding.
- Dexie IndexedDB storage.
- Invite links and QR display.
- One-to-one chat UI.
- Standalone Fastify WebSocket relay.
- Render two-service deployment config.
- Docker dev scaffolding.
- Unit and E2E test scaffolding.

## Phase 2

- Signal protocol WASM adapter boundary.
- X3DH and Double Ratchet integration planning behind the adapter.
- Production sealed envelope schema and libsodium sealed-box scaffold.
- Redis relay queue with development memory fallback.
- Client-side AES-GCM file encryption.
- Blind upload request route.

## Phase 3

- Local group creation and invite-oriented group records.
- Group invite URLs that hydrate group records locally.
- Group sender-key encryption scaffold.
- Relay fan-out for opaque group envelopes.
- Replies, mentions, conversation search, edit, unsend, and disappearing messages.
- Voice/video call surface with WebRTC media capture.
- Insertable Streams capability detection.
- SFU and TURN privacy planning.

## Phase 4

- Stripe Checkout routes and verified webhook ingestion.
- Subscription status endpoint linked to `pubkey_hash`.
- Server-signed capability tokens for paid-plan features.
- Referral redemption without contact-book or identity upload.
- Shareable invite cards and group migration payloads.
- Launch route at `/launch`.
- GitHub Actions CI for install, typecheck, tests, and build.
- Production deployment guide and security hardening checklist.
