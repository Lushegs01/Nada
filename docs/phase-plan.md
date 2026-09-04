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

## Hardening pass

- Real message encryption wired through every send and receive path; the mock
  base64 codec is gone from the application.
- Public-key integrity: verified before use and before storage, learned from
  signed payloads, never overwritten by an unverifiable value.
- Group and status content keys sealed per recipient.
- Status reads authenticated; per-viewer key envelopes.
- Relay: socket heartbeat, frame and rate ceilings, per-identity connection cap,
  graceful shutdown, dependency-aware `/ready`.
- Offline queue made crash-safe (claim, settle, restore) rather than
  delete-on-drain.
- Stripe webhooks made idempotent; referral redemptions made unique.
- Media uploads authenticated and given a retention window.
- Lint restored across the monorepo and enforced in CI; store actions bound once
  at module scope so `react-hooks/exhaustive-deps` can run.
- Client memory bounded; reconnect backoff jittered.

## Next

1. Signal sessions or MLS for forward secrecy.
2. Group key rotation on membership change.
3. Proof-gated media downloads.
4. CSP nonces to drop `unsafe-inline`.
5. Load testing at institution scale.
