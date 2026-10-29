# Local Cloudflare Stream stand-in (dev only) — see server.ts.
FROM oven/bun:1.3.11
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY server.ts .
EXPOSE 7071
CMD ["bun", "server.ts"]
