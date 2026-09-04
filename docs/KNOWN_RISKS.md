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

## No Post-Compromise Security

Risk: Prekeys give forward secrecy but are not a ratchet.
What breaks if wrong: An attacker who takes a device's *current* prekey state
reads messages until those keys rotate — one-time prekeys as they are consumed,
the signed prekey on its weekly schedule. Past messages are safe; future ones
are not, until rotation.
Manual verification: Confirm `SIGNED_PREKEY_LIFETIME_MS` is short enough to
bound the window and that the client actually replenishes. Closing it properly
needs a Double Ratchet or the Signal adapter; the wire format is versioned
(`v: 3`) so a successor can land beside it.

## Prekey Exhaustion

Risk: One-time prekeys are a finite published supply, and anyone with an
identity can claim one.
What breaks if wrong: An attacker who drains a victim's supply forces every
sender onto the signed-prekey path, where forward secrecy is bounded by weekly
rotation rather than per message. Delivery is unaffected.
Manual verification: Confirm claims require an identity proof (so draining is
attributable and rate-limited), that the client replenishes below its
threshold, and that exhaustion degrades to the signed prekey rather than to a
sealed box.

## Forward Secrecy Costs Queued Mail

Risk: Prekey private halves are not derived from the seed phrase.
What breaks if wrong: An identity restored on a new device cannot open messages
that were queued for the old one — the keys are gone. This is forward secrecy
working, not a defect, but it is surprising if the product implies a seed
phrase restores everything.
Manual verification: Confirm onboarding and recovery copy does not promise that
a seed phrase recovers message history or undelivered mail.

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

## Group Media Download Authorization

Risk: Direct media is authorized to the two identities named on the object.
Group media cannot be: `recipientPubkeyHash` holds the group id there, and the
relay has no membership to check against.
What breaks if wrong: Any authenticated identity that learns a group object's
id can fetch its ciphertext. That is much narrower than the previous
"anyone at all", and the bytes are client-encrypted, but it is not membership
control.
Manual verification: Confirm downloads require a proof bound to the object id,
that a stranger gets 404 rather than 403 on direct media, and that
`MEDIA_TTL_SECONDS` matches the bucket lifecycle rule — the relay refusing to
serve an expired object does not reclaim the bytes.

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

## Group Key Rotation Is Manual

Risk: Rotation exists ("Reset group key", owner-only) but nothing triggers it
automatically, and there is no member-removal UI to trigger it from.
What breaks if wrong: A leaked invite link, or someone who should no longer be
in the group, keeps reading until an owner remembers to rotate.
Manual verification: Confirm the group menu exposes the reset action and that
its copy explains what it revokes. Automatic rotation on membership change is
the remaining work, and needs a membership-management surface first.

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
arbitrary identities. Three things bound it: the payload is encrypted under a
key those identities do not hold, the client only *admits* a new group when it
was sealed a key for it, and the socket budget is charged per delivery rather
than per envelope. None of these is membership control.
Manual verification: Confirm the 512-recipient schema cap, the per-delivery
fan-out charge, and the client-side admission check are all in force before
treating group fan-out as abuse-resistant.

## WebRTC Calling

Risk: Browser WebRTC may expose network metadata and requires careful TURN/SFU
configuration.
What breaks if wrong: Calls may undermine anonymity claims even when media is
encrypted.
Manual verification: Verify TURN/SFU routing, Insertable Streams availability,
ICE candidate policy, and UI privacy warnings before enabling production calls.

## Middleware CSP Coverage

Risk: The Content-Security-Policy is applied by `middleware.ts`, whose matcher
excludes static assets by path.
What breaks if wrong: A new document route that happens to match an excluded
pattern would be served with no policy at all, silently losing the nonce
protection for that page.
Manual verification: After adding a route, confirm `curl -D-` on it returns a
`content-security-policy` header containing a `nonce-`. Pages must also render
dynamically — a prerendered page carries no nonce and every script on it is
refused.
