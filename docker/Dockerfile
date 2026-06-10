FROM oven/bun:alpine AS builder
ARG DOCKER_BUILD="1"
WORKDIR /app

COPY . .

RUN bun install --ignore-scripts

ENV NEXT_STANDALONE_OUTPUT="true"
ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN bun run build

RUN bun build scripts/agent-worker.ts \
      --target=node \
      --format=esm \
      --conditions=react-server \
      --external pg-native \
      --outfile scripts/agent-worker.bundled.mjs

FROM oven/bun:alpine AS migrate-bundler
WORKDIR /app
COPY scripts/standalone-migrate.mjs ./scripts/
RUN bun add drizzle-orm pg && \
    bun build scripts/standalone-migrate.mjs \
      --target=node \
      --format=esm \
      --outfile scripts/standalone-migrate.bundled.mjs

FROM node:23-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

COPY --from=builder /app/src/lib/db/migrations ./src/lib/db/migrations

COPY --from=migrate-bundler /app/scripts/standalone-migrate.bundled.mjs ./scripts/standalone-migrate.mjs

COPY --from=builder /app/scripts/agent-worker.bundled.mjs ./scripts/agent-worker.mjs

USER nextjs

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

EXPOSE 3000

CMD ["node", "server.js"]
