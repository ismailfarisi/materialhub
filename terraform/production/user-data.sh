#!/bin/bash
set -x  # log all commands for debugging

# ─── Install Docker ───────────────────────────────────────────
yum update -y
yum install -y docker aws-cli jq
systemctl enable docker && systemctl start docker
usermod -aG docker ec2-user

# Install Docker Compose
COMPOSE_URL="https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)"
curl -L "$COMPOSE_URL" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# ─── Get instance metadata (IMDSv2) ──────────────────────────
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 300")
INSTANCE_ID=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/instance-id)

# ─── Attach Elastic IP ───────────────────────────────────────
aws ec2 associate-address \
  --instance-id "$INSTANCE_ID" \
  --allocation-id "${eip_allocation_id}" \
  --region "${aws_region}"

# ─── Attach & mount persistent EBS volume ─────────────────────
aws ec2 attach-volume \
  --volume-id "${ebs_volume_id}" \
  --instance-id "$INSTANCE_ID" \
  --device /dev/xvdf \
  --region "${aws_region}"

# Wait for volume to attach
sleep 15

# Format only if new
if ! blkid /dev/xvdf; then
  mkfs.ext4 /dev/xvdf
fi

mkdir -p /data
mount /dev/xvdf /data

# Persist mount across reboots
echo "/dev/xvdf /data ext4 defaults,nofail 0 2" >> /etc/fstab

# Create data directories (Typesense + Caddy certs)
mkdir -p /data/typesense /data/caddy_data /data/caddy_config

# ─── Write base .env (non-secret config only) ─────────────────
mkdir -p /opt/materialhub
cat > /opt/materialhub/.env <<ENVEOF
# ─── Infra ────────────────────────────────────────────────────
NODE_ENV=production
AWS_REGION=${aws_region}
ECR_REGISTRY=${ecr_registry}
PROJECT_NAME=${project_name}

# ─── Database (DB_PASSWORD comes from SSM) ────────────────────
DB_HOST=${db_host}
DB_PORT=${db_port}
DB_USERNAME=${db_username}
DB_NAME=${db_name}

# ─── Redis ────────────────────────────────────────────────────
REDIS_HOST=${redis_host}
REDIS_PORT=6379

# ─── Typesense (TYPESENSE_API_KEY comes from SSM) ─────────────
TYPESENSE_HOST=typesense
TYPESENSE_PORT=8108

# ─── API port ─────────────────────────────────────────────────
# The backend is one process (backend/apps/api) that calls its modules
# in-process, so no per-module host/port/URL variables are needed.
GATEWAY_PORT=3000

# ─── Media (S3 + CloudFront) ──────────────────────────────────
S3_MEDIA_BUCKET=${s3_media_bucket}
CLOUDFRONT_DOMAIN=${cloudfront_domain}

# ─── Frontend URLs (vendor-invite / admin links) ──────────────
VENDOR_DASHBOARD_URL=${vendor_dashboard_url}
ADMIN_PANEL_URL=${admin_panel_url}

# ─── Storefront URLs (CORS allowlist / Tamara redirect allowlist) ─────
# Same literal fallback backend/apps/api/src/app.ts already hardcodes for prod
# CORS and libs/config/src/index.ts now hardcodes for the Tamara
# merchant-redirect allowlist — seeded here too (rather than left
# code-default-only) so it's explicit in the deployed env, same as
# APP_URL/PUBLIC_API_URL below. CI's SSM sync (deploy-prod.yml) overrides
# this on every deploy; this is only the first-boot value.
WEB_URL=https://materialhubuae.com
WEB_WWW_URL=https://www.materialhubuae.com

# ─── Email (AWS SES) ──────────────────────────────────────────
# SES is region-scoped via SES_REGION (separate from AWS_REGION so S3/media
# region is independent). materialhubuae.com is the verified SES identity, with
# production access, in ap-south-1. APP_URL backs verify/reset/magic-link
# emails; PUBLIC_API_URL backs the newsletter unsubscribe link (the API).
SES_REGION=ap-south-1
SES_FROM_ADDRESS=noreply@materialhubuae.com
APP_URL=https://materialhubuae.com
PUBLIC_API_URL=https://api.materialhubuae.com
ENVEOF

# ─── Pull the SSM refresher from S3 and run it ────────────────
# Too large to embed in user_data (16 KB cap); lives in s3://${config_bucket}/.
aws s3 cp \
  "s3://${config_bucket}/scripts/refresh-env-from-ssm.sh" \
  /opt/materialhub/refresh-env-from-ssm.sh \
  --region "${aws_region}"
chmod +x /opt/materialhub/refresh-env-from-ssm.sh

AWS_REGION=${aws_region} /opt/materialhub/refresh-env-from-ssm.sh \
  /opt/materialhub/.env "${project_name}" production

# ─── Caddyfile ────────────────────────────────────────────────
cat > /opt/materialhub/Caddyfile <<'CADDYEOF'
${api_domain} {
  reverse_proxy {
    dynamic a api 3000
  }
}
CADDYEOF

cat > /opt/materialhub/config.alloy <<'ALLOYEOF'
logging {
  level  = "info"
  format = "logfmt"
}

discovery.docker "containers" {
  host = "unix:///var/run/docker.sock"
}

discovery.relabel "docker_logs" {
  targets = discovery.docker.containers.targets

  rule {
    source_labels = ["__meta_docker_container_label_com_docker_compose_service"]
    target_label  = "service"
  }

  rule {
    source_labels = ["__meta_docker_container_name"]
    regex         = "/(.*)"
    target_label  = "container"
  }

  rule {
    target_label = "environment"
    replacement  = "production"
  }
}

loki.source.docker "containers" {
  host       = "unix:///var/run/docker.sock"
  targets    = discovery.relabel.docker_logs.output
  forward_to = [loki.process.docker.receiver]
}

loki.process "docker" {
  stage.json {
    expressions = {
      level = "level",
    }
  }

  stage.labels {
    values = {
      level = "",
    }
  }

  forward_to = [loki.write.grafana_cloud.receiver]
}

loki.write "grafana_cloud" {
  endpoint {
    url = sys.env("GRAFANA_CLOUD_LOKI_URL")

    basic_auth {
      username = sys.env("GRAFANA_CLOUD_LOGS_USERNAME")
      password = sys.env("GRAFANA_CLOUD_TOKEN")
    }
  }
}

prometheus.exporter.cadvisor "docker" {
  docker_host      = "unix:///var/run/docker.sock"
  storage_duration = "5m"
}

prometheus.scrape "cadvisor" {
  targets         = prometheus.exporter.cadvisor.docker.targets
  scrape_interval = "30s"
  forward_to      = [prometheus.remote_write.grafana_cloud.receiver]
}

prometheus.remote_write "grafana_cloud" {
  endpoint {
    url = sys.env("GRAFANA_CLOUD_PROMETHEUS_REMOTE_WRITE_URL")

    basic_auth {
      username = sys.env("GRAFANA_CLOUD_METRICS_USERNAME")
      password = sys.env("GRAFANA_CLOUD_TOKEN")
    }
  }
}
ALLOYEOF

# ─── docker-compose.yml ──────────────────────────────────────
# Keep in step with the copy deploy-prod.yml writes on every deploy.
cat > /opt/materialhub/docker-compose.yml <<'COMPOSEEOF'
services:
  caddy:
    image: caddy:2-alpine
    restart: always
    mem_limit: 128m
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - /data/caddy_data:/data
      - /data/caddy_config:/config
    depends_on:
      - api

  typesense:
    image: typesense/typesense:27.1
    restart: always
    mem_limit: 1g
    volumes:
      - /data/typesense:/data
    environment:
      TYPESENSE_API_KEY: $${TYPESENSE_API_KEY}
      TYPESENSE_DATA_DIR: /data

  # The whole API (gateway + every module) in one process. The image keeps
  # the gateway's ECR repo name (terraform/shared/ecr.tf).
  api:
    image: $${ECR_REGISTRY}/materialhub-api-gateway:production
    restart: always
    # 3g: one process runs every module (the former per-service limits summed
    # to ~4.25g; product and integration needed 1g each for the Typesense
    # reindex and feed builds).
    mem_limit: 3g
    expose:
      - "3000"
    env_file: .env
    networks:
      default:
        aliases:
          - api-gateway
    healthcheck:
      test: ["CMD", "bun", "-e", "fetch('http://127.0.0.1:'+(process.env.GATEWAY_PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
      interval: 15s
      timeout: 5s
      retries: 5
      start_period: 60s
    depends_on:
      - typesense

  alloy:
    image: grafana/alloy:latest
    privileged: true
    restart: unless-stopped
    mem_limit: 384m
    command:
      - run
      - --server.http.listen-addr=0.0.0.0:12345
      - --storage.path=/var/lib/alloy/data
      - /etc/alloy/config.alloy
    env_file: .env
    volumes:
      - ./config.alloy:/etc/alloy/config.alloy:ro
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - /data/alloy:/var/lib/alloy/data
      # cAdvisor (per-container metrics) needs host fs access; cgroup v2 on AL2023
      - /:/rootfs:ro
      - /sys:/sys:ro
      - /var/lib/docker/:/var/lib/docker:ro
      - /dev/disk/:/dev/disk:ro
      - /var/run:/var/run:ro
      - /dev/kmsg:/dev/kmsg

  # One-shot migration runner. profiles: ["tools"] keeps it out of `up`.
  # Invoke:  docker-compose --profile tools run --rm migrate
  migrate:
    image: $${ECR_REGISTRY}/materialhub-api-gateway:production
    command: bun run libs/database/src/run-migrations.ts
    env_file: .env
    profiles: ["tools"]
COMPOSEEOF

# ─── Start services ──────────────────────────────────────────
cd /opt/materialhub

aws ecr get-login-password --region "${aws_region}" | \
  docker login --username AWS --password-stdin "${ecr_registry}"

# --ignore-pull-failures: on first boot the :production images may not exist
# yet (no release tag pushed). The first tagged deploy pulls them properly.
docker-compose pull --ignore-pull-failures
docker-compose up -d
