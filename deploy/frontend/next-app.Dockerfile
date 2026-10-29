# Shared image for the three Next.js apps on the prod frontend EC2.
# Build from repo root:
#   docker build -f deploy/frontend/next-app.Dockerfile \
#     --build-arg APP=web --build-arg PORT=4000 .
# NEXT_PUBLIC_* values are baked in at build time from apps/$APP/.env.production
# (written by CI — see scripts/write-frontend-env.sh).

ARG APP
ARG PORT

# ─── Workspace manifests only, so `bun install` caches across source edits ───
FROM oven/bun:1.3.13 AS manifests
WORKDIR /src
COPY . .
RUN mkdir /out \
  && cp package.json bun.lock /out/ \
  && find . -name package.json -not -path "*/node_modules/*" -not -path "./package.json" \
     -exec sh -c 'mkdir -p "/out/$(dirname "$1")" && cp "$1" "/out/$1"' _ {} \;

FROM oven/bun:1.3.13 AS build
ARG APP
WORKDIR /app
COPY --from=manifests /out/ ./
RUN bun install --frozen-lockfile
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN cd "apps/${APP}" && bun run build \
  # vendor-dashboard / admin-panel have no public/ dir; the runtime COPY needs one.
  && mkdir -p public

# ─── Runtime: glibc (matches the sharp binary bun installed) ─────────────────
FROM node:20-slim AS runtime
ARG APP
ARG PORT
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=${PORT} \
    APP=${APP}
WORKDIR /app
COPY --from=build --chown=node:node /app/apps/${APP}/.next/standalone/ ./
COPY --from=build --chown=node:node /app/apps/${APP}/.next/static ./apps/${APP}/.next/static
COPY --from=build --chown=node:node /app/apps/${APP}/public ./apps/${APP}/public
RUN mkdir -p "apps/${APP}/.next/cache" && chown -R node:node "apps/${APP}/.next/cache"
USER node
EXPOSE ${PORT}
CMD ["sh", "-c", "exec node apps/${APP}/server.js"]
