# Build from repo root:  docker build -f backend/apps/cms-service/Dockerfile .
FROM oven/bun:1.3 AS base
WORKDIR /app

FROM base AS deps
COPY backend/package.json backend/tsconfig.json ./
COPY backend/libs ./libs
COPY backend/apps/cms-service ./apps/cms-service
RUN bun install --production

FROM base
COPY --from=deps /app ./
EXPOSE 3006
CMD ["bun", "run", "apps/cms-service/src/index.ts"]
