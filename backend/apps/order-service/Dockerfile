# Build from repo root:  docker build -f backend/apps/order-service/Dockerfile .
FROM oven/bun:1.3 AS base
WORKDIR /app

FROM base AS deps
COPY backend/package.json backend/tsconfig.json ./
COPY backend/libs ./libs
COPY backend/apps/order-service ./apps/order-service
RUN bun install --production

FROM base
COPY --from=deps /app ./
EXPOSE 3003
CMD ["bun", "run", "apps/order-service/src/index.ts"]
