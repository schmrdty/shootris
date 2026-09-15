# syntax=docker/dockerfile:1
# Shootris — self-hosted deployment image
# Build:  docker build -t shootris .
# Run:    docker run -d -p 3000:3000 --name shootris shootris
#
# NOTE: NEXT_PUBLIC_* env vars are baked in at BUILD time. Keep your
# .env.local in the build context (it is copied below) or pass values
# with --build-arg and re-build whenever they change.

FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
# pnpm's package store persists between builds, so a lockfile change only
# downloads what actually changed
RUN --mount=type=cache,id=shootris-pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts

FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 BUILD_STANDALONE=1
# Keep Next's webpack cache between builds. Without it every deploy compiles
# the wallet libraries from scratch; with it, compile time roughly halves.
# Reset with: sudo docker builder prune --filter id=shootris-next-cache
RUN --mount=type=cache,id=shootris-next-cache,target=/app/.next/cache \
    pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Persistent app data (Farcaster notification tokens) — mounted as a volume
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data
ENV DATA_DIR=/app/data
USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
