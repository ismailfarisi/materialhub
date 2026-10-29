# Build from repo root:  docker build -f backend/apps/notification-service/Dockerfile .
FROM oven/bun:1.3 AS base
WORKDIR /app

FROM base AS deps
COPY backend/package.json backend/tsconfig.json ./
COPY backend/libs ./libs
COPY backend/apps/notification-service ./apps/notification-service
RUN bun install --production

FROM base
COPY --from=deps /app ./
EXPOSE 3005
CMD ["bun", "run", "apps/notification-service/src/index.ts"]
