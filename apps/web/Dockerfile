FROM node:22.12.0-alpine

WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages packages
RUN pnpm install --no-frozen-lockfile
COPY apps/web apps/web
CMD ["pnpm", "--filter", "web", "start"]
