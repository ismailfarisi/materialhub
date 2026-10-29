# Build from repo root:  docker build -f backend/apps/vendor-service/Dockerfile .
FROM oven/bun:1.4 AS base
WORKDIR /app

FROM base AS deps
COPY backend/package.json backend/tsconfig.json ./
COPY backend/libs ./libs
COPY backend/apps/vendor-service ./apps/vendor-service
RUN bun install --production

FROM base
COPY --from=deps /app ./
EXPOSE 3004
CMD ["bun", "run", "apps/vendor-service/src/index.ts"]
