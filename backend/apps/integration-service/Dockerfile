# Build from repo root: docker build -f backend/apps/integration-service/Dockerfile .
FROM oven/bun:1.3 AS base
WORKDIR /app

FROM base AS deps
COPY backend/package.json backend/tsconfig.json ./
COPY backend/libs ./libs
COPY backend/apps/integration-service ./apps/integration-service
RUN bun install --production

FROM base
COPY --from=deps /app ./
EXPOSE 3008
CMD ["bun", "run", "apps/integration-service/src/index.ts"]
