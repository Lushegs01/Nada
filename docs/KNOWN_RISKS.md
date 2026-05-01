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

## Redis Relay Queue

Risk: `REDIS_URL` may be absent or misconfigured.
What breaks if wrong: Offline production envelopes are not durable across relay
restarts.
Manual verification: Confirm production relay has a managed Redis URL and
`RELAY_QUEUE_TTL_SECONDS` matches the retention policy.

## Signal Adapter

Risk: `@signalapp/libsignal-client` licensing, native loading, and browser
bundle behavior require explicit review.
What breaks if wrong: Signal protocol code may fail to load or impose licensing
obligations that are incompatible with the product plan.
Manual verification: Confirm legal review, install behavior, browser/WASM
loading, and app bundle impact before enabling Signal-backed sessions.

## Blind Upload Storage

Risk: Phase 2 creates upload request scaffolding but does not configure S3/R2.
What breaks if wrong: Encrypted files remain local-only and cannot be retrieved
by recipients.
Manual verification: Confirm blob storage, expiry, content-hash addressing, and
absence of user-to-file mapping before enabling attachment delivery.

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
