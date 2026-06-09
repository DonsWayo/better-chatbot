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

FROM node:23-alpine AS migrate-bundler
WORKDIR /app
COPY scripts/standalone-migrate.mjs ./scripts/
# Bundle drizzle-orm + pg so the runner image needs no extra node_modules
RUN npm install --save-exact drizzle-orm pg && \
    npx --yes esbuild scripts/standalone-migrate.mjs \
      --bundle --platform=node --format=esm \
      --banner:js="import{createRequire}from'module';const require=createRequire(import.meta.url);" \
      --outfile=scripts/standalone-migrate.bundled.mjs

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

# Standalone migration entrypoint (bundled — no external module deps required)
COPY --from=migrate-bundler /app/scripts/standalone-migrate.bundled.mjs ./scripts/standalone-migrate.mjs

USER nextjs

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

EXPOSE 3000

# server.js is created by next build from the standalone output
# https://nextjs.org/docs/pages/api-reference/config/next-config-js/output
CMD ["node", "server.js"]