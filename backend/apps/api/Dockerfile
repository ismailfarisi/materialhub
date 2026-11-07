# MaterialHub API: the whole backend in one image. backend/apps/api boots the
# public app and every module (auth, product, order, vendor, notification, cms,
# integration) in one process; see backend/apps/api/src/index.ts.
#
# Build from the repo root:
#   docker build -f backend/apps/api/Dockerfile -t materialhub-api .
#
# The image runs the TypeScript sources with an installed node_modules, the
# same way the former per-service images did, not the `bun run build` bundle:
# the bundle inlines pdfkit, which reads its .afm font files relative to
# __dirname (they would be missing next to dist/index.js), and sharp's native
# addon. The `migrate` one-shot in the compose files also runs
# libs/database/src/run-migrations.ts from this image.

# ── Workspace manifests only, so `bun install` is cached across source edits ──
FROM oven/bun:1.4 AS manifests
WORKDIR /src
COPY backend/ .
RUN mkdir /out \
  && cp package.json bun.lock /out/ \
  && find apps libs -name package.json -not -path "*/node_modules/*" \
     -exec sh -c 'mkdir -p "/out/$(dirname "$1")" && cp "$1" "/out/$1"' _ {} \;

# ── Dependencies for every backend workspace (apps/* + libs/*) and the sources ──
# Also the dev target of backend/docker-compose.yml.
FROM oven/bun:1.4 AS deps
WORKDIR /app
COPY --from=manifests /out/ ./
RUN bun install --production --frozen-lockfile
COPY backend/tsconfig.json ./
COPY backend/libs ./libs
COPY backend/apps ./apps

# ── Runtime ──
FROM oven/bun:1.4
# ffmpeg: product video transcoding (product module, video-transcode.worker.ts).
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=deps /app ./
EXPOSE 3000
CMD ["bun", "run", "apps/api/src/index.ts"]
