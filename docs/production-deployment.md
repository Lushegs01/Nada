# Production Deployment

## Services

Deploy from `render.yaml`:

- `app-web`: Next.js PWA.
- `app-relay`: Fastify WebSocket/API relay (horizontally scalable).
- `nada-redis`: shared Redis.
- `nada-db`: managed PostgreSQL.

Do not merge the relay into the web app. The relay must remain separately
scalable and separately configurable.

## Scaling

The relay runs multiple instances. Socket presence is per-process, so
cross-instance delivery depends entirely on Redis pub/sub: when a recipient has
no socket on the instance handling the send, the relay publishes to a
per-recipient channel and only treats the recipient as offline when no instance
claims them.

**Never raise `numInstances` without `REDIS_URL` set.** Without Redis the relay
falls back to single-instance behaviour and a second instance silently
misroutes messages as "recipient offline".

Verify before and after scaling:

```bash
curl -s https://<relay-host>/health
```

```json
{
  "ok": true,
  "service": "nada-relay",
  "backends": {
    "database": "postgres",
    "media": "s3",
    "queue": "redis",
    "scaling": "multi-instance"
  }
}
```

Any `"memory"` or `"local"` value in production means a required backend is
unconfigured and data will be lost.

## Capacity

Two settings need to be sized together:

- `DATABASE_POOL_MAX` is per instance. Keep
  `numInstances * DATABASE_POOL_MAX` comfortably under the database plan's
  connection limit.
- `RATE_LIMIT_IDENTITY_MAX` is the per-student budget per minute. A client
  spends roughly 9 requests/minute on background polling, so the default of 240
  leaves wide headroom.

`RATE_LIMIT_IP_MAX` applies **only** to requests that carry no identity. It must
never gate identity-bearing traffic: an institution NATs thousands of students
behind a handful of egress addresses, so counting them together throttles the
entire campus at once.

## Required Environment

`app-web`:

- `NEXT_PUBLIC_RELAY_URL`: Render `fromService` host for `app-relay`.
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`: public half of the relay's VAPID pair.

`app-relay`:

- `PORT`: Render provided.
- `ALLOWED_ORIGIN`: Render `fromService` host for `app-web`.
- `DATABASE_URL`: Managed PostgreSQL connection string.
- `DATABASE_POOL_MAX`: pooled connections per instance (default 10).
- `REDIS_URL`: Managed Redis. Backs the offline queue, shared rate-limit
  counters, and cross-instance socket routing.
- `RELAY_QUEUE_TTL_SECONDS`: retention policy in seconds.
- `ZERO_LOG_MODE=true`: disables pino request logs in production.
- `MEDIA_S3_BUCKET`, `MEDIA_S3_REGION`, `MEDIA_S3_ACCESS_KEY_ID`,
  `MEDIA_S3_SECRET_ACCESS_KEY`: object storage for encrypted media. Set
  `MEDIA_S3_ENDPOINT` too for S3-compatible providers (R2, MinIO, B2); omit it
  for AWS S3.
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`: web push. Without
  these the relay accepts subscriptions but never sends a notification.
- `STRIPE_SECRET_KEY`: Stripe restricted secret key.
- `STRIPE_WEBHOOK_SECRET`: Stripe endpoint signing secret.
- `STRIPE_PRICE_PRO`: Stripe recurring price ID.
- `STRIPE_PRICE_BUSINESS`: Stripe recurring price ID.
- `STRIPE_PRICE_ENTERPRISE`: Stripe recurring price ID.
- `CAPABILITY_TOKEN_SECRET`: at least 32 random characters.
- `CAPABILITY_ISSUER_SECRET`: at least 32 random characters.

Optional tuning: `RATE_LIMIT_IDENTITY_MAX`, `RATE_LIMIT_IP_MAX`.

## Media Storage

Encrypted media goes to an S3-compatible bucket. The local-disk driver is a
development fallback only — container filesystems are wiped on every deploy and
are not shared between instances, so attachments uploaded through one instance
would 404 from another.

Generate VAPID keys once with:

```bash
npx web-push generate-vapid-keys
```

## Stripe

1. Create recurring Stripe prices for Pro, Business, and Enterprise.
2. Configure the webhook endpoint:
   `/api/v1/subscription/webhook`.
3. Enable at least these events:
   `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`.
4. Confirm Stripe metadata contains only `pubkey_hash`, `plan`, and optional
   `referral_code`.

Payment identity is linkable by Stripe. Do not describe paid NADA accounts as
anonymous from the payment processor.

## Release Gate

Before promoting:

```bash
corepack pnpm install
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

Then verify:

- PWA install works on the deployed Render domain.
- `/health` reports `postgres`, `s3`, `redis`, and `multi-instance`.
- WebSocket registration succeeds from the deployed web origin.
- A message sent between two clients is delivered while the relay runs more
  than one instance (exercises the presence bus, not just local routing).
- A repeat feed poll returns `304 Not Modified` when nothing has changed.
- Checkout redirects to Stripe and returns to the app.
- Subscription webhooks update status without logging identifiers.
- Capability tokens are issued only for active paid plans.
- Settings still shows the IP-anonymity warning.
