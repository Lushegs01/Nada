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

## No Forward Secrecy

Risk: Messages are sealed to a long-term identity key with no ratchet.
What breaks if wrong: Anyone who later obtains an identity private key — a
seized device, a restored seed phrase, a compromised backup — can decrypt every
message ever sent to that identity, including ciphertext captured months
earlier. This is the largest remaining gap against Signal.
Manual verification: Confirm product copy never claims forward secrecy or
Signal equivalence. Closing it means wiring the Signal adapter or MLS through
`@nada/crypto`; the sealed-envelope format is versioned (`v: 2`) so a
successor can be introduced without breaking existing history.

## Unencryptable Recipients

Risk: NADA may hold no verified identity key for a contact — an old record, a
peer met before key exchange, or a contact whose stored key fails its hash
check.
What breaks if wrong: The body can only be base64-encoded, and the relay can
read it. The send path reports this to the user once per conversation rather
than presenting it as private.
Manual verification: Confirm the "sent without encryption" notice still fires,
and that `encryptDirectBody` never returns `encrypted: true` without both a
verified recipient key and an unlocked identity.

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

## Offline Queue Redelivery

Risk: The offline queue is at-least-once. Envelopes are parked in an in-flight
list during replay and only settled once written to the socket, so a crash
between the write and the settle redelivers them.
What breaks if wrong: A duplicate arrives. Clients deduplicate by envelope id
on write, so a duplicate is invisible — but any future consumer that does not
deduplicate would double-apply it.
Manual verification: Confirm every inbound path keys on envelope id before
persisting, and that `relay_queue_inflight:*` keys carry the queue TTL so an
abandoned batch cannot outlive its retention window.

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

## Unauthenticated Whisper Feed Reads

Risk: The public Whispers feed exposes every author's pubkey hash and requires
no proof to read.
What breaks if wrong: Pubkey hashes are enumerable. That is by design for a
public feed, but it means any hash-keyed endpoint must authenticate its reader
— which is why status reads now require an identity proof.
Manual verification: Before adding any endpoint that takes a pubkey hash and
returns private data, confirm it verifies an identity proof bound to the
caller.

## Signal Adapter

Risk: `@signalapp/libsignal-client` licensing, native loading, and browser
bundle behavior require explicit review.
What breaks if wrong: Signal protocol code may fail to load or impose licensing
obligations that are incompatible with the product plan.
Manual verification: Confirm legal review, install behavior, browser/WASM
loading, and app bundle impact before enabling Signal-backed sessions.

## Media Download Authorization

Risk: `/api/media/:id` serves any object to anyone who knows its id. Uploads
require an identity proof; downloads do not.
What breaks if wrong: An id leak exposes ciphertext. Objects are encrypted
client-side with a key that travels in the message envelope, so this is an
unauthenticated read of ciphertext rather than a disclosure — but it is still
an unauthenticated read, and it permits enumeration attempts.
Manual verification: Confirm `MEDIA_TTL_SECONDS` matches the bucket lifecycle
rule, since the relay refusing to serve an expired object does not reclaim the
bytes. Add proof-gated downloads before treating object ids as sensitive.

## Stripe Webhook Raw Body

Risk: Stripe signature verification requires raw webhook bytes, and Stripe
retries every non-2xx delivery.
What breaks if wrong: Legitimate subscription events fail verification, or a
retried event is applied twice.
Manual verification: Confirm `/api/v1/subscription/webhook` receives a Buffer
body, rejects requests without a valid `stripe-signature`, and claims the event
id in `stripe_events` before doing any work. Note that Stripe can deliver
events out of order: the handler is idempotent per event but does not currently
reject a stale `customer.subscription.updated` arriving after a `deleted`.

## Group Key Rotation

Risk: The group sender key is sealed to each member, so the relay cannot read
it — but nothing rotates it when membership changes.
What breaks if wrong: A removed member keeps the key they already hold and can
decrypt subsequent messages if they still receive the envelopes. The relay
fans out to the recipient list the sender supplies, so removal is enforced by
the sender's client, not by the server.
Manual verification: Confirm group removal copy does not promise that a removed
member loses access. Rotation on membership change is the fix.

## Group Invite Links

Risk: Group invites carry the sender key in the URL, so the link is the group
credential.
What breaks if wrong: Anyone who obtains a forwarded invite link can decrypt
messages sent after they join.
Manual verification: Confirm invite-sharing copy says the link admits its
holder. Replace with authenticated admission and per-member key delivery before
treating group membership as access control.

## Relay-Trusted Group Fan-Out

Risk: The relay fans a group message out to the recipient list the sender
supplies; it holds no group membership state.
What breaks if wrong: A malicious client can address a "group message" to
arbitrary identities. The payload is encrypted under a key those identities do
not hold, so this is a spam and metadata vector rather than a disclosure, and
it is bounded by the 512-recipient schema cap and the per-socket envelope
limit.
Manual verification: Confirm the recipient cap and per-socket rate limit are in
force before treating group fan-out as abuse-resistant.

## WebRTC Calling

Risk: Browser WebRTC may expose network metadata and requires careful TURN/SFU
configuration.
What breaks if wrong: Calls may undermine anonymity claims even when media is
encrypted.
Manual verification: Verify TURN/SFU routing, Insertable Streams availability,
ICE candidate policy, and UI privacy warnings before enabling production calls.
