#!/bin/bash
# First-boot setup for the prod frontend host (see frontend.tf).
# Everything app-specific (compose file, Caddyfile, images) arrives on the
# first deploy-prod.yml run; this only prepares the box.
set -euxo pipefail

# ─── Docker + Compose ─────────────────────────────────────────
# The EIP attaches mid-boot and can briefly drop connectivity — retry.
for _ in 1 2 3 4 5; do dnf install -y docker jq && break; sleep 10; done
systemctl enable --now docker
usermod -aG docker ec2-user

COMPOSE_URL="https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)"
curl -fsSL --retry 5 --retry-all-errors "$COMPOSE_URL" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# ─── 2 GB swap: headroom for three Node processes on 2 GB RAM ──
if [ ! -f /swapfile ]; then
  dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo "/swapfile none swap sw 0 0" >> /etc/fstab
fi

# ─── App directory (bind mounts used by deploy/frontend/docker-compose.yml) ──
mkdir -p /opt/materialhub-web/data/{caddy_data,caddy_config,next_cache,alloy}
# next_cache is written by the web container's non-root `node` user (uid 1000).
chown 1000:1000 /opt/materialhub-web/data/next_cache
