# Security Hardening Checklist

## Claims

- Never describe NADA as Signal-equivalent or forward-secret. It is confidential
  against the relay; an identity key obtained later decrypts message history.
- Never claim metadata privacy. The relay routes on sender and recipient.
- Keep the UI warning that browser PWAs do not provide IP-level anonymity.
- Keep the "sent without encryption" notice on send paths where no verified
  recipient key exists — a message the user believes is private and is not is
  worse than one that visibly failed.
- Keep group-invite copy honest: the link carries the group key.

## Client

- Verify TypeScript strict mode and `exactOptionalPropertyTypes`.
- Keep `react-hooks/exhaustive-deps` enabled and failing the build. It is the
  rule that catches stale closures in the dashboard; blanket
  `/* eslint-disable */` headers are not an acceptable way to satisfy it.
- Keep `pnpm lint` green and running in CI ahead of typecheck.
- Confirm WebSocket instances live only in the Zustand store.
- Confirm no secrets enter the client bundle.
- Confirm PWA manifest and service worker paths are relative.
- Confirm encrypted file keys are never uploaded in plaintext.
- Confirm every inbound buffer in the socket store is acknowledged or capped.
  A PWA stays installed for weeks; an unbounded buffer is a slow leak.
- Confirm reconnect backoff keeps its jitter. A deterministic ladder makes the
  whole population retry in lockstep after a relay restart.

## Relay

- Run with `ZERO_LOG_MODE=true` in production.
- Confirm pino redaction covers headers, pubkey hashes, content hashes, Stripe
  identifiers, capability tokens, and message payloads.
- Enforce `ALLOWED_ORIGIN` for HTTP and WebSocket traffic.
- Validate every input with Zod before use.
- Keep Redis durable queues enabled for production sealed envelopes.
- Keep PostgreSQL enabled for subscription and capability-token records.
- Confirm `/ready` reports every dependency and that monitoring polls it —
  `/health` is liveness and answers `ok` with the database down, by design.
- Confirm the socket heartbeat, frame cap, per-socket envelope limit and
  per-identity connection cap are all in force.
- Confirm SIGTERM shutdown runs: sockets closed with a close frame, Postgres
  and Redis drained. Verify a deploy does not sever connections mid-flight.
- Confirm the offline queue settles only what it delivered. A drain that
  deletes up front loses a user's whole backlog when a socket drops.

## Payments

- Use restricted Stripe keys.
- Verify Stripe webhook signatures against raw request bytes.
- Confirm webhook events are claimed by id before any write, and that
  subscriptions are keyed on the Stripe subscription id rather than a fresh
  uuid — otherwise every retry inserts another row.
- Store only `pubkey_hash`, Stripe customer/subscription IDs, plan, status, and
  token hashes.
- Never monetize or inspect message content.
- Explain Stripe payment linkability in paid-plan copy.

## Cryptography

Done:

- Direct messages sealed to the recipient's key and signed inside the box.
- Group and status keys sealed per member instead of sent in the clear.
- Public keys verified against their hash before use or storage — a contact
  record holding a bad key silently reroutes a whole conversation.
- The relay rejects any envelope whose `senderPublicKey` does not hash to the
  authenticated socket identity.

Outstanding:

- Wire Signal sessions (or MLS) for forward secrecy. The envelope format is
  versioned so a successor can land beside `v: 2`.
- Rotate group keys on membership change.
- Review `@signalapp/libsignal-client` licensing and browser/WASM loading.
- Keep libsodium calls behind `getSodium()`.

## Calls

- Configure TURN/SFU routing before production calls.
- Verify Insertable Streams support and fallback messaging.
- Disable or redact ICE candidate logging.

## Operations

- Require CI lint, typecheck, test, and build before deploy.
- Build with `--frozen-lockfile` in every environment, so a production build
  cannot resolve dependency versions CI never verified.
- Run dependency and license review before launch.
- Configure Sentry with PII scrubbing and message-body denial rules.
- Load test WebSocket fan-out and Redis queue draining.
- Back up PostgreSQL and document retention.
