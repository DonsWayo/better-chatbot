FROM node:23-alpine AS builder
ARG DOCKER_BUILD="1"
WORKDIR /app

COPY . . 

# Install pnpm
RUN corepack enable pnpm

RUN pnpm install --frozen-lockfile

# Makes the next output standalone
# https://github.com/vercel/next.js/discussions/65511
ENV NEXT_STANDALONE_OUTPUT="true"

RUN pnpm build

# Bundle the standalone migrate script so it has no external module deps in the runner image
RUN pnpm exec esbuild scripts/standalone-migrate.mjs \
  --bundle --platform=node --format=esm \
  --outfile=scripts/standalone-migrate.mjs.tmp && \
  mv scripts/standalone-migrate.mjs.tmp scripts/standalone-migrate.mjs

FROM node:23-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
# disable telemetry during runtime.
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy migrations content
COPY --from=builder /app/src/lib/db/migrations ./src/lib/db/migrations

# Standalone migration entrypoint (used by the EKS Helm pre-upgrade Job — ADR-0006)
COPY --from=builder /app/scripts/standalone-migrate.mjs ./scripts/standalone-migrate.mjs

USER nextjs

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

EXPOSE 3000

# server.js is created by next build from the standalone output
# https://nextjs.org/docs/pages/api-reference/config/next-config-js/output
CMD ["node", "server.js"]