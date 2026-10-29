# Build from repo root:  docker build -f backend/apps/reels-service/Dockerfile .
FROM oven/bun:1.3 AS base
WORKDIR /app

FROM base AS deps
COPY backend/package.json backend/tsconfig.json ./
COPY backend/libs ./libs
COPY backend/apps/reels-service ./apps/reels-service
RUN bun install --production

FROM base
COPY --from=deps /app ./
EXPOSE 3007
CMD ["bun", "run", "apps/reels-service/src/index.ts"]
