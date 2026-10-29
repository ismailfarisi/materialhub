terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  backend "s3" {
    bucket       = "materialhub-terraform-state"
    key          = "production/terraform.tfstate"
    region       = "ap-south-1"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region = var.aws_region
}

# CloudFront ACM certificates must be issued in us-east-1.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

data "aws_caller_identity" "current" {}

# ─── Default VPC ──────────────────────────────────────────────
data "aws_vpc" "default" {
  default = true
}

# All default subnets — span multiple AZs, required for RDS/cache subnet groups.
data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

# Subnets in the chosen AZ — the EC2 instance and EBS volume live here.
data "aws_subnets" "app_az" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
  filter {
    name   = "availability-zone"
    values = [var.availability_zone]
  }
}

# ─── Route 53 hosted zone (already exists — staging resolves through it) ──────
data "aws_route53_zone" "main" {
  name         = var.domain_name
  private_zone = false
}

# ─── Security group: app host ─────────────────────────────────
resource "aws_security_group" "app" {
  name        = "${var.project_name}-${var.environment}-app-sg"
  description = "Production app host - only Caddy ports are public"
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
    Name        = "${var.project_name}-${var.environment}-app-sg"
    Environment = var.environment
  }
}

# ─── Security group: RDS ──────────────────────────────────────
resource "aws_security_group" "db" {
  name        = "${var.project_name}-${var.environment}-db-sg"
  description = "Production RDS PostgreSQL - reachable only from the app host"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description     = "PostgreSQL from the app host"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-db-sg"
    Environment = var.environment
  }
}

# ─── Security group: ElastiCache ──────────────────────────────
resource "aws_security_group" "cache" {
  name        = "${var.project_name}-${var.environment}-cache-sg"
  description = "Production ElastiCache Redis - reachable only from the app host"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description     = "Redis from the app host"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-cache-sg"
    Environment = var.environment
  }
}

# ─── S3 bucket for boot-time bootstrap assets ─────────────────
# Holds refresh-env-from-ssm.sh, pulled by the box on boot and on each deploy.
resource "aws_s3_bucket" "config" {
  bucket = "${var.project_name}-config-prod"

  tags = {
    Environment = var.environment
  }
}

resource "aws_s3_bucket_public_access_block" "config" {
  bucket                  = aws_s3_bucket.config.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "config" {
  bucket = aws_s3_bucket.config.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_object" "refresh_script" {
  bucket = aws_s3_bucket.config.id
  key    = "scripts/refresh-env-from-ssm.sh"
  source = "${path.module}/../../scripts/refresh-env-from-ssm.sh"
  etag   = filemd5("${path.module}/../../scripts/refresh-env-from-ssm.sh")
}
