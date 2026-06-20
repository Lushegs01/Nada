# Dependency Compatibility Notes

All workspace package versions are exact pins. No dependency uses `^` or `~`.

## Confirmed Phase 1 Baseline

- Next.js `14.2.32` with React `18.3.1`.
- TypeScript `5.9.3`.
- Fastify `4.29.1` with Fastify v4 plugin lines.
- pnpm `10.33.0` and Turbo `2.9.6`.

## Requires Build Verification

- `next-pwa` `5.6.0` is retained because it is part of the required stack.
  Its Next.js 14 App Router behavior must be verified during `pnpm build`.
- `@signalapp/libsignal-client` `0.93.1` is AGPL-licensed and native/WASM-heavy.
  It is isolated behind `loadSignalAdapter()` until install, licensing, bundle,
  and browser-loading behavior are explicitly verified.
