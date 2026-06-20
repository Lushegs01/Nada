# Production Deployment

## Services

Deploy exactly two Render web services:

- `app-web`: Next.js PWA.
- `app-relay`: Fastify WebSocket/API relay.

Do not merge the relay into the web app. The relay must remain separately
scalable and separately configurable.

## Required Environment

`app-web`:

- `NEXT_PUBLIC_RELAY_URL`: Render `fromService` host for `app-relay`.

`app-relay`:

- `PORT`: Render provided.
- `ALLOWED_ORIGIN`: Render `fromService` host for `app-web`.
- `DATABASE_URL`: Managed PostgreSQL connection string.
- `REDIS_URL`: Managed Redis connection string for queued sealed envelopes.
- `RELAY_QUEUE_TTL_SECONDS`: retention policy in seconds.
- `ZERO_LOG_MODE=true`: disables pino request logs in production.
- `STRIPE_SECRET_KEY`: Stripe restricted secret key.
- `STRIPE_WEBHOOK_SECRET`: Stripe endpoint signing secret.
- `STRIPE_PRICE_PRO`: Stripe recurring price ID.
- `STRIPE_PRICE_BUSINESS`: Stripe recurring price ID.
- `STRIPE_PRICE_ENTERPRISE`: Stripe recurring price ID.
- `CAPABILITY_TOKEN_SECRET`: at least 32 random characters.
- `CAPABILITY_ISSUER_SECRET`: at least 32 random characters.

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
- `/health` returns `ok` on `app-relay`.
- WebSocket registration succeeds from the deployed web origin.
- Checkout redirects to Stripe and returns to the app.
- Subscription webhooks update status without logging identifiers.
- Capability tokens are issued only for active paid plans.
- Settings still shows the IP-anonymity warning.
