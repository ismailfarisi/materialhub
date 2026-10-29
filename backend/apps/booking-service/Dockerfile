# Build from repo root:  docker build -f backend/apps/booking-service/Dockerfile .
FROM oven/bun:1.3 AS base
WORKDIR /app

FROM base AS deps
COPY backend/package.json backend/tsconfig.json ./
COPY backend/libs ./libs
COPY backend/apps/booking-service ./apps/booking-service
RUN bun install --production

FROM base
COPY --from=deps /app ./
EXPOSE 3009
CMD ["bun", "run", "apps/booking-service/src/index.ts"]
