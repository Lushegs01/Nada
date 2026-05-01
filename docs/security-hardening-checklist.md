# Security Hardening Checklist

## Claims

- Keep every mock path labeled `// ⚠️ MVP_ONLY — replace before production`.
- Do not claim Phase 1 or Phase 3 scaffolds provide production-grade anonymity.
- Keep the UI warning that browser PWAs do not provide IP-level anonymity.

## Client

- Verify TypeScript strict mode and `exactOptionalPropertyTypes`.
- Audit every `useEffect` dependency array.
- Confirm WebSocket instances live only in the Zustand store.
- Confirm no secrets enter the client bundle.
- Confirm PWA manifest and service worker paths are relative.
- Confirm encrypted file keys are never uploaded in plaintext.

## Relay

- Run with `ZERO_LOG_MODE=true` in production.
- Confirm pino redaction covers headers, pubkey hashes, content hashes, Stripe
  identifiers, capability tokens, and message payloads.
- Enforce `ALLOWED_ORIGIN` for HTTP and WebSocket traffic.
- Validate every input with Zod before use.
- Keep Redis durable queues enabled for production sealed envelopes.
- Keep PostgreSQL enabled for subscription and capability-token records.

## Payments

- Use restricted Stripe keys.
- Verify Stripe webhook signatures against raw request bytes.
- Store only `pubkey_hash`, Stripe customer/subscription IDs, plan, status, and
  token hashes.
- Never monetize or inspect message content.
- Explain Stripe payment linkability in paid-plan copy.

## Cryptography

- Replace mock direct-message encryption with Signal protocol sessions.
- Replace group sender-key scaffolding with audited Signal Sender Keys or MLS.
- Rotate group keys on membership changes.
- Review `@signalapp/libsignal-client` licensing and browser/WASM loading.
- Keep libsodium calls behind `getSodium()`.

## Calls

- Configure TURN/SFU routing before production calls.
- Verify Insertable Streams support and fallback messaging.
- Disable or redact ICE candidate logging.

## Operations

- Require CI typecheck, test, and build before deploy.
- Run dependency and license review before launch.
- Configure Sentry with PII scrubbing and message-body denial rules.
- Load test WebSocket fan-out and Redis queue draining.
- Back up PostgreSQL and document retention.
