FROM node:22.12.0-alpine

WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-workspace.yaml turbo.json ./
COPY apps/relay/package.json apps/relay/package.json
COPY packages packages
RUN pnpm install --no-frozen-lockfile
COPY apps/relay apps/relay
CMD ["pnpm", "--filter", "relay", "start"]
