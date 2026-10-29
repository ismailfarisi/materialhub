# Build from repo root:  docker build -f backend/apps/auth-service/Dockerfile .
FROM oven/bun:1.3 AS base
WORKDIR /app

FROM base AS deps
COPY backend/package.json backend/tsconfig.json ./
COPY backend/libs ./libs
COPY backend/apps/auth-service ./apps/auth-service
RUN bun install --production

FROM base
COPY --from=deps /app ./
EXPOSE 3001
CMD ["bun", "run", "apps/auth-service/src/index.ts"]
