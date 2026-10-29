# ─── Frontend host ────────────────────────────────────────────
# One small box running the three Next.js apps (web, vendor-dashboard,
# admin-panel) behind Caddy. Replaced Vercel in 2026-10. Images come from ECR
# (built in deploy-prod.yml); config files come from s3://<config>/frontend/.
# Deliberately separate from the backend app host so frontend load or crashes
# never touch the API, and with its own IAM role so it cannot read backend
# secrets.

resource "aws_security_group" "frontend" {
  name        = "${var.project_name}-${var.environment}-frontend-sg"
  description = "Production frontend host - only Caddy ports are public"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description = "HTTP (Caddy ACME challenge + HTTPS redirect)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-frontend-sg"
    Environment = var.environment
  }
}

resource "aws_eip" "frontend" {
  domain = "vpc"

  tags = {
    Name        = "${var.project_name}-${var.environment}-frontend-eip"
    Environment = var.environment
  }
}

# Standard AL2023 only. compute.tf's `al2023-ami-*-x86_64` also matches the
# *minimal* image, which ships without the SSM agent and AWS CLI — the box
# never registers with SSM and the deploy script can't run.
data "aws_ami" "al2023_standard" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-2023.*-x86_64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

resource "aws_instance" "frontend" {
  ami                    = data.aws_ami.al2023_standard.id
  instance_type          = var.frontend_instance_type
  subnet_id              = data.aws_subnets.app_az.ids[0]
  vpc_security_group_ids = [aws_security_group.frontend.id]
  iam_instance_profile   = aws_iam_instance_profile.frontend.name

  root_block_device {
    volume_size = 20
    volume_type = "gp3"
    encrypted   = true
  }

  user_data = file("${path.module}/user-data-frontend.sh")

  tags = {
    Name        = "${var.project_name}-${var.environment}-frontend"
    Environment = var.environment
  }

  # Host-failure recovery comes from EC2's simplified automatic recovery
  # (on by default for t3a; MaintenanceOptions.AutoRecovery = "default"), so no
  # CloudWatch recover alarm — the terraform user can't create alarms anyway.

  lifecycle {
    ignore_changes = [ami]
  }
}

resource "aws_eip_association" "frontend" {
  instance_id   = aws_instance.frontend.id
  allocation_id = aws_eip.frontend.id
}

# ─── IAM: ECR pull, SSM agent, frontend config, Grafana creds only ───────────
resource "aws_iam_role" "frontend" {
  name = "${var.project_name}-${var.environment}-frontend-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ec2.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "frontend_ssm_core" {
  role       = aws_iam_role.frontend.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy" "frontend" {
  name = "${var.project_name}-${var.environment}-frontend-policy"
  role = aws_iam_role.frontend.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken",
          "ecr:BatchGetImage",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchCheckLayerAvailability",
        ]
        Resource = "*"
      },
      {
        # docker-compose.yml, Caddyfile, config.alloy — synced by deploy-prod.yml
        Effect   = "Allow"
        Action   = ["s3:GetObject"]
        Resource = "${aws_s3_bucket.config.arn}/frontend/*"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = aws_s3_bucket.config.arn
        Condition = {
          StringLike = { "s3:prefix" = ["frontend/*"] }
        }
      },
      {
        # Log/metric shipping only. Every other /materialhub/production/* secret
        # stays unreadable from this box.
        Effect = "Allow"
        Action = ["ssm:GetParameter", "ssm:GetParameters"]
        Resource = [
          "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter/${var.project_name}/${var.environment}/grafana/*",
        ]
      },
      {
        Effect   = "Allow"
        Action   = ["kms:Decrypt", "kms:DescribeKey"]
        Resource = aws_kms_key.ssm.arn
      },
    ]
  })
}

resource "aws_iam_instance_profile" "frontend" {
  name = "${var.project_name}-${var.environment}-frontend-profile"
  role = aws_iam_role.frontend.name
}

# ─── ECR repos for the frontend images ────────────────────────
# Kept here rather than in terraform/shared (whose state is not stored
# remotely) so the whole frontend stack applies with one targeted apply.
locals {
  frontend_apps = toset(["web", "vendor-dashboard", "admin-panel"])
}

resource "aws_ecr_repository" "frontend" {
  for_each = local.frontend_apps

  name                 = "${var.project_name}-${each.value}"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "frontend" {
  for_each   = aws_ecr_repository.frontend
  repository = each.value.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 5 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 5
      }
      action = {
        type = "expire"
      }
    }]
  })
}

# ─── CI permissions for build-frontend / deploy-frontend ──────
# A separate policy on the shared GitHub Actions role (see cicd.tf) so applying
# the frontend stack never pulls the backend instance into the plan.
resource "aws_iam_role_policy" "github_actions_frontend" {
  name = "${var.project_name}-github-actions-frontend-policy"
  role = data.aws_iam_role.github_actions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ecr:BatchGetImage",
          "ecr:BatchCheckLayerAvailability",
          "ecr:CompleteLayerUpload",
          "ecr:GetDownloadUrlForLayer",
          "ecr:InitiateLayerUpload",
          "ecr:PutImage",
          "ecr:UploadLayerPart",
        ]
        Resource = [for repo in aws_ecr_repository.frontend : repo.arn]
      },
      {
        Effect = "Allow"
        Action = ["ssm:SendCommand"]
        Resource = [
          "arn:aws:ssm:${var.aws_region}::document/AWS-RunShellScript",
          "arn:aws:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:instance/${aws_instance.frontend.id}",
        ]
      },
      {
        # deploy-frontend uploads deploy/frontend/* (compose, Caddyfile,
        # config.alloy) for the box to pull.
        Effect   = "Allow"
        Action   = ["s3:PutObject"]
        Resource = "${aws_s3_bucket.config.arn}/frontend/*"
      },
    ]
  })
}

# ─── Backend rate-limit exemption ─────────────────────────────
# Every server-side render on the storefront calls the API from this one IP;
# without the exemption the 100 req/min per-IP limit would 429 real traffic.
# refresh-env-from-ssm.sh maps this to RATE_LIMIT_EXEMPT_IPS on the backend.
resource "aws_ssm_parameter" "rate_limit_exempt_ips" {
  name  = "/${var.project_name}/${var.environment}/rate-limit/exempt-ips"
  type  = "String"
  value = aws_eip.frontend.public_ip

  tags = {
    Environment = var.environment
    Project     = var.project_name
  }
}

# ─── DNS (unused while on Cloudflare) ─────────────────────────
# The live records are in Cloudflare (DNS only, A → frontend EIP). This stays
# disabled; it only matters if the domain's nameservers ever move to Route 53.
resource "aws_route53_record" "frontend" {
  for_each = var.frontend_dns_enabled ? toset([
    var.domain_name,
    "www.${var.domain_name}",
    "sellers.${var.domain_name}",
    "admin.${var.domain_name}",
  ]) : toset([])

  zone_id         = data.aws_route53_zone.main.zone_id
  name            = each.value
  type            = "A"
  ttl             = 60
  records         = [aws_eip.frontend.public_ip]
  allow_overwrite = true
}
