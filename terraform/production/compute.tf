# ─── AMI (latest Amazon Linux 2023) ───────────────────────────
data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# ─── Elastic IP ───────────────────────────────────────────────
resource "aws_eip" "app" {
  domain = "vpc"

  tags = {
    Name        = "${var.project_name}-${var.environment}-eip"
    Environment = var.environment
  }
}

# ─── Persistent data volume (Typesense data + Caddy certs) ────
resource "aws_ebs_volume" "data" {
  availability_zone = var.availability_zone
  size              = var.ebs_data_size
  type              = "gp3"
  encrypted         = true

  tags = {
    Name        = "${var.project_name}-${var.environment}-data"
    Environment = var.environment
  }
}

# ─── EC2 app host ─────────────────────────────────────────────
resource "aws_instance" "app" {
  ami                    = data.aws_ami.al2023.id
  instance_type          = var.instance_type
  key_name               = var.key_name
  subnet_id              = data.aws_subnets.app_az.ids[0]
  vpc_security_group_ids = [aws_security_group.app.id]
  iam_instance_profile   = aws_iam_instance_profile.ec2.name

  root_block_device {
    volume_size = 30
    volume_type = "gp3"
    encrypted   = true
  }

  user_data = base64encode(templatefile("${path.module}/user-data.sh", {
    aws_region           = var.aws_region
    eip_allocation_id    = aws_eip.app.id
    ebs_volume_id        = aws_ebs_volume.data.id
    ecr_registry         = "${data.aws_caller_identity.current.account_id}.dkr.ecr.${var.aws_region}.amazonaws.com"
    project_name         = var.project_name
    config_bucket        = aws_s3_bucket.config.id
    db_host              = aws_db_instance.main.address
    db_port              = tostring(aws_db_instance.main.port)
    db_username          = var.db_username
    db_name              = var.db_name
    redis_host           = aws_elasticache_cluster.main.cache_nodes[0].address
    api_domain           = var.api_subdomain
    s3_media_bucket      = aws_s3_bucket.media.id
    cloudfront_domain    = var.cdn_subdomain
    vendor_dashboard_url = var.vendor_dashboard_url
    admin_panel_url      = var.admin_panel_url
  }))

  tags = {
    Name        = "${var.project_name}-${var.environment}"
    Environment = var.environment
  }

  # Do not replace the box just because a newer AL2023 AMI shipped.
  lifecycle {
    ignore_changes = [ami]
  }
}
