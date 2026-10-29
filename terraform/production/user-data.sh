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

# ─── Service ports ────────────────────────────────────────────
GATEWAY_PORT=3000
AUTH_PORT=3001
PRODUCT_PORT=3002
ORDER_PORT=3003
VENDOR_PORT=3004
NOTIFICATION_PORT=3005
CMS_PORT=3006
INTEGRATION_PORT=3008

# ─── Service hosts (docker-compose service names) ────────────
AUTH_HOST=auth-service
PRODUCT_HOST=product-service
ORDER_HOST=order-service
VENDOR_HOST=vendor-service
NOTIFICATION_HOST=notification-service
CMS_HOST=cms-service
INTEGRATION_HOST=integration-service

# ─── Inter-service URLs ───────────────────────────────────────
NOTIFICATION_SERVICE_URL=http://notification-service:3005
INTEGRATION_SERVICE_URL=http://integration-service:3008

# ─── Media (S3 + CloudFront) ──────────────────────────────────
S3_MEDIA_BUCKET=${s3_media_bucket}
CLOUDFRONT_DOMAIN=${cloudfront_domain}

# ─── Frontend URLs (vendor-invite / admin links) ──────────────
VENDOR_DASHBOARD_URL=${vendor_dashboard_url}
ADMIN_PANEL_URL=${admin_panel_url}

# ─── Storefront URLs (CORS allowlist / Tamara redirect allowlist) ─────
# Same literal fallback api-gateway/src/app.ts already hardcodes for prod
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
# emails; PUBLIC_API_URL backs the newsletter unsubscribe link (API gateway).
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
    dynamic a api-gateway 3000
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
      - api-gateway

  typesense:
    image: typesense/typesense:27.1
    restart: always
    mem_limit: 1g
    volumes:
      - /data/typesense:/data
    environment:
      TYPESENSE_API_KEY: $${TYPESENSE_API_KEY}
      TYPESENSE_DATA_DIR: /data

  api-gateway:
    image: $${ECR_REGISTRY}/materialhub-api-gateway:production
    restart: always
    mem_limit: 384m
    expose:
      - "3000"
    env_file: .env

  auth-service:
    image: $${ECR_REGISTRY}/materialhub-auth-service:production
    restart: always
    mem_limit: 384m
    env_file: .env

  product-service:
    image: $${ECR_REGISTRY}/materialhub-product-service:production
    restart: always
    # 1g (not 384m): product-service runs the Typesense reindex + incremental
    # search-sync workers, which load batches of products with all relations.
    # At 384m the reindex OOM-killed the bun process after the first batch,
    # leaving the search index permanently stale (only the oldest ~100
    # products visible on the storefront). The box has ample headroom.
    mem_limit: 1g
    env_file: .env
    depends_on:
      - typesense

  order-service:
    image: $${ECR_REGISTRY}/materialhub-order-service:production
    restart: always
    mem_limit: 384m
    env_file: .env

  vendor-service:
    image: $${ECR_REGISTRY}/materialhub-vendor-service:production
    restart: always
    mem_limit: 384m
    env_file: .env

  notification-service:
    image: $${ECR_REGISTRY}/materialhub-notification-service:production
    restart: always
    mem_limit: 384m
    env_file: .env

  cms-service:
    image: $${ECR_REGISTRY}/materialhub-cms-service:production
    restart: always
    mem_limit: 384m
    env_file: .env

  integration-service:
    image: $${ECR_REGISTRY}/materialhub-integration-service:production
    restart: always
    # 1g: integration-service owns sales-channel feed generation. The feed
    # builder hydrates product relations and runs alongside BullMQ workers; 384m
    # OOM-killed Bun during Google Merchant feed builds.
    mem_limit: 1g
    env_file: .env

  alloy:
    image: grafana/alloy:latest
    restart: unless-stopped
    mem_limit: 256m
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
