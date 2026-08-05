# KNOWN_RISKS.md

## Deployment URLs

Risk: Render service host values may not include a protocol.
What breaks if wrong: The web client cannot form a valid WebSocket URL.
Manual verification: Confirm `NEXT_PUBLIC_RELAY_URL` resolves to the relay host
and the client normalizes it to a `wss://` `/ws` URL.

## Ports

Risk: The relay requires `process.env.PORT`.
What breaks if wrong: The relay refuses to boot.
Manual verification: Confirm Render or the local shell supplies `PORT`.

## CORS Origins

Risk: Render may pass host-only values while browsers send full origins.
What breaks if wrong: WebSocket upgrades are rejected.
Manual verification: Confirm `ALLOWED_ORIGIN` matches the deployed web host after
host normalization.

## WASM Loading Order

Risk: `libsodium-wrappers` is asynchronous.
What breaks if wrong: Crypto calls fail at runtime.
Manual verification: Confirm all sodium methods are behind `getSodium()`.

## Service Worker Scope

Risk: Absolute paths or fixed domains can bind the PWA to one host.
What breaks if wrong: Installability and offline caching fail after deployment.
Manual verification: Confirm `start_url`, `scope`, and `sw` are relative `/`
paths and service-worker helper code uses `self.location.origin`.

## Render Service Wiring

Risk: Web and relay services may be merged by mistake.
What breaks if wrong: WebSocket scaling, CORS, and deployment boundaries collapse.
Manual verification: Confirm `render.yaml` creates `app-web` and `app-relay`.

## Phase 1 Mock Encryption

Risk: Phase 1 message secrecy is not production-grade.
What breaks if wrong: Users may trust a demo as secure messaging.
Manual verification: Confirm every mock path is labeled
`// ⚠️ MVP_ONLY — replace before production`.

## WebSocket Reconnection

Risk: Recreating sockets in React render paths can cause infinite loops.
What breaks if wrong: React maximum update depth errors and relay spam.
Manual verification: Confirm sockets live in the Zustand store.

## Payment Linkability

Risk: Stripe can link payment identity to `pubkey_hash`.
What breaks if wrong: Paid users are not anonymous from the payment processor.
Manual verification: Confirm paid-plan copy explains this limitation.

## Capability Token Secret

Risk: Capability tokens are HMAC signed by `CAPABILITY_TOKEN_SECRET`.
What breaks if wrong: A weak or leaked secret allows feature-token forgery.
Manual verification: Use a high-entropy secret, rotate on suspected exposure,
and store only token hashes server-side.

## IP-Level Anonymity

Risk: Browser PWAs do not control network routing.
What breaks if wrong: Privacy claims become misleading.
Manual verification: Confirm UI warning remains visible in Settings.

## Redis (Queue, Rate Limits, Cross-Instance Routing)

Risk: `REDIS_URL` may be absent or misconfigured. Redis now backs three things:
the offline envelope queue, shared rate-limit counters, and the pub/sub
channels that let one relay instance deliver to a socket held by another.
What breaks if wrong: The relay silently degrades to single-instance, in-memory
behaviour — queued envelopes are lost on restart, rate limits are enforced
per-process (so N instances allow N times the limit), and running more than one
instance misroutes messages as "recipient offline".
Manual verification: `GET /health` must report `queue: "redis"` and
`scaling: "multi-instance"`. Confirm `RELAY_QUEUE_TTL_SECONDS` matches the
retention policy and that the Redis plan uses `noeviction`, since queued
envelopes are durable data rather than a disposable cache.

## Relay Instance Count

Risk: `numInstances` may be raised without Redis configured.
What breaks if wrong: Socket presence is per-process. Without the Redis
presence bus, a sender on instance A cannot see a recipient on instance B and
queues the message as offline instead of delivering it.
Manual verification: Confirm `/health` reports `scaling: "multi-instance"`
before scaling past one instance.

## Postgres Connection Pool

Risk: `DATABASE_POOL_MAX` multiplied by `numInstances` may exceed the database
plan's connection limit.
What breaks if wrong: New connections are refused under load and requests fail.
Manual verification: Confirm `numInstances * DATABASE_POOL_MAX` leaves headroom
under the plan's limit, and that the database plan is not the free tier.

## Media Object Storage

Risk: The relay falls back to local disk when the `MEDIA_S3_*` variables are
incomplete.
What breaks if wrong: Attachments are written to the container filesystem,
which is wiped on every deploy and is not shared between instances, so uploads
disappear and 404 unpredictably.
Manual verification: `GET /health` must report `media: "s3"` in production.

## Feed Cache Staleness

Risk: Feed aggregates (Echo/Ripple/Reflection counts) are cached per instance
for a few seconds.
What breaks if wrong: A count can lag reality by up to the cache TTL. Viewer
state (`echoedByViewer`, `rippledByViewer`) is deliberately excluded from the
cache, so a user's own interaction is always reflected immediately.
Manual verification: Confirm `FEED_CACHE_TTL_MS` stays well below the client
poll interval, and that write paths call `invalidateFeedCaches`.

## Signal Adapter

Risk: `@signalapp/libsignal-client` licensing, native loading, and browser
bundle behavior require explicit review.
What breaks if wrong: Signal protocol code may fail to load or impose licensing
obligations that are incompatible with the product plan.
Manual verification: Confirm legal review, install behavior, browser/WASM
loading, and app bundle impact before enabling Signal-backed sessions.

## Blind Upload Storage

Risk: Encrypted media now has an S3-compatible backend, but the blind-upload
request flow (`/api/v1/upload/request`) still returns scaffolding rather than
presigned URLs, and stored objects have no expiry policy.
What breaks if wrong: Objects accumulate without retention, and the blind-upload
path cannot deliver files independently of `/api/media/:id`.
Manual verification: Confirm a bucket lifecycle rule enforces retention, and
review content-hash addressing and the absence of user-to-file mapping before
enabling the blind-upload delivery path.

## Stripe Webhook Raw Body

Risk: Stripe signature verification requires raw webhook bytes.
What breaks if wrong: Legitimate subscription events fail verification or an
unverified webhook path becomes tempting to enable.
Manual verification: Confirm `/api/v1/subscription/webhook` receives a Buffer
body and rejects requests without a valid `stripe-signature`.

## Group Sender Keys

Risk: Phase 3 group sender keys are local symmetric-key scaffolding.
What breaks if wrong: Users may believe groups have production Signal Sender Key
security, including membership-change secrecy and compromise recovery.
Manual verification: Replace the scaffold with audited Signal Sender Keys or MLS
before production group messaging is advertised as secure.

## Group Invite Links

Risk: Phase 3 group invites carry a mock sender-key package in the URL.
What breaks if wrong: Anyone with the invite URL may gain group decrypt
capability in the MVP scaffold.
Manual verification: Replace URL-carried sender keys with authenticated group
membership admission and encrypted key distribution before production.

## WebRTC Calling

Risk: Browser WebRTC may expose network metadata and requires careful TURN/SFU
configuration.
What breaks if wrong: Calls may undermine anonymity claims even when media is
encrypted.
Manual verification: Verify TURN/SFU routing, Insertable Streams availability,
ICE candidate policy, and UI privacy warnings before enabling production calls.
