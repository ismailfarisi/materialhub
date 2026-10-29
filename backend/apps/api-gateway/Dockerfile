# Build from repo root:  docker build -f backend/apps/api-gateway/Dockerfile .
FROM oven/bun:1.3 AS base
WORKDIR /app

FROM base AS deps
COPY backend/package.json backend/tsconfig.json ./
COPY backend/libs ./libs
COPY backend/apps/api-gateway ./apps/api-gateway
RUN bun install --production

FROM base
COPY --from=deps /app ./
EXPOSE 3000
CMD ["bun", "run", "apps/api-gateway/src/index.ts"]
