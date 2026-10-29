# Build from repo root:  docker build -f backend/apps/product-service/Dockerfile .
FROM oven/bun:1.4 AS base
WORKDIR /app

FROM base AS deps
COPY backend/package.json backend/tsconfig.json ./
COPY backend/libs ./libs
COPY backend/apps/product-service ./apps/product-service
RUN bun install --production

FROM base
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app ./
EXPOSE 3002
CMD ["bun", "run", "apps/product-service/src/index.ts"]
