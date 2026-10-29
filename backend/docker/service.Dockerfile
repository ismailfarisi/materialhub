# Shared multi-stage Dockerfile for all backend microservices.
# Build from the backend/ root:
#   docker build -f docker/service.Dockerfile \
#     --build-arg SERVICE=auth-service \
#     --build-arg PORT=3001 .

ARG BUN_VERSION=1.3
FROM oven/bun:${BUN_VERSION} AS base
WORKDIR /app

# ── Install dependencies ─────────────────────────────────────────────
FROM base AS deps
ARG SERVICE
COPY package.json bun.lock ./
COPY apps/${SERVICE}/package.json ./apps/${SERVICE}/
COPY libs/config/package.json ./libs/config/
COPY libs/plugins/package.json ./libs/plugins/
COPY libs/guards/package.json ./libs/guards/
COPY libs/database/package.json ./libs/database/
COPY libs/dto/package.json ./libs/dto/
COPY libs/utils/package.json ./libs/utils/
RUN bun install --frozen-lockfile

# ── Build ─────────────────────────────────────────────────────────────
FROM deps AS build
ARG SERVICE
COPY libs ./libs
COPY apps/${SERVICE} ./apps/${SERVICE}
RUN cd apps/${SERVICE} && bun run build

# ── Production ────────────────────────────────────────────────────────
FROM base AS production
ARG SERVICE
ARG PORT=3000
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/apps/${SERVICE}/dist ./dist
COPY --from=build /app/libs ./libs

EXPOSE ${PORT}
CMD ["bun", "run", "dist/index.js"]
