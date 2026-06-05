# syntax=docker/dockerfile:1

# --- Build stage ---
FROM oven/bun:1-alpine AS builder

WORKDIR /app

# Install dependencies first for better layer caching
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# Copy the source and build (runs scripts/bake.mjs then vite build -> ./build)
COPY . .
RUN bun run build

# --- Runtime stage ---
FROM oven/bun:1-alpine

WORKDIR /app

# Coolify healthchecks expect wget/curl in the runtime image
RUN apk add --no-cache wget

COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

ENV NODE_ENV=production
# adapter-node listens on PORT (default 3000). DATABASE_URL is injected by Coolify.
ENV PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
	CMD wget --spider --quiet http://127.0.0.1:3000/ || exit 1

CMD ["bun", "build/index.js"]
