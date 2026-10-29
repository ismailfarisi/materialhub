# ─── DB subnet group (RDS requires subnets in >= 2 AZs) ──────────────────────
resource "aws_db_subnet_group" "main" {
  name       = "${var.project_name}-${var.environment}"
  subnet_ids = data.aws_subnets.default.ids

  tags = {
    Environment = var.environment
  }
}

# ─── Generated master password ────────────────────────────────
# RDS forbids / @ " and space in the master password.
resource "random_password" "db" {
  length           = 32
  special          = true
  override_special = "!#$%^&*()-_=+"
}

# ─── RDS PostgreSQL instance ──────────────────────────────────
resource "aws_db_instance" "main" {
  identifier     = "${var.project_name}-${var.environment}"
  engine         = "postgres"
  engine_version = "16"
  instance_class = var.db_instance_class

  allocated_storage     = var.db_allocated_storage
  max_allocated_storage = var.db_max_allocated_storage
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = var.db_name
  username = var.db_username
  password = random_password.db.result
  port     = 5432

  multi_az               = false
  availability_zone      = var.availability_zone
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.db.id]
  publicly_accessible    = false

  backup_retention_period = 7
  backup_window           = "18:00-19:00"
  maintenance_window      = "sun:19:30-sun:20:30"
  copy_tags_to_snapshot   = true

  performance_insights_enabled          = true
  performance_insights_retention_period = 7

  deletion_protection       = true
  skip_final_snapshot       = false
  final_snapshot_identifier = "${var.project_name}-${var.environment}-final"
  apply_immediately         = false

  tags = {
    Name        = "${var.project_name}-${var.environment}"
    Environment = var.environment
  }

  # RDS reports the resolved minor version (e.g. 16.6); ignore so a minor-version
  # drift does not force an unintended apply.
  lifecycle {
    ignore_changes = [engine_version]
  }
}

# ─── DB password → SSM ────────────────────────────────────────
resource "aws_ssm_parameter" "db_password" {
  name   = "/${var.project_name}/${var.environment}/db/password"
  type   = "SecureString"
  key_id = aws_kms_key.ssm.id
  value  = random_password.db.result

  tags = {
    Environment = var.environment
    Project     = var.project_name
  }
}
