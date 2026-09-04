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

## Risk-elimination pass

- Forward secrecy: X3DH-style prekeys, relay distribution, consumption on
  receipt, replenishment. Sealed-box fallback when a peer has published none.
- Group key epochs and owner-triggered rotation, which is what makes a leaked
  invite link revocable.
- Proof-gated media downloads with object-level authorization.
- Stripe events ordered by their own clock, so a replay cannot resurrect a
  cancelled plan.
- Group fan-out charged per delivery; clients admit a group only on a sealed key.
- CSP nonces; 'unsafe-inline' gone from script-src.
- Call logs encrypted (they were going out in the clear).

## Next

1. A ratchet for post-compromise security.
2. Membership management, and automatic rotation on removal.
3. Server-side group membership, or an accepted decision not to have it.
4. Load testing the multi-instance path with Redis in the loop.
