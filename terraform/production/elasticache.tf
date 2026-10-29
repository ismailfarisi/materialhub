resource "aws_elasticache_subnet_group" "main" {
  name       = "${var.project_name}-${var.environment}"
  subnet_ids = data.aws_subnets.default.ids
}

# volatile-lru: evict only keys that have a TTL. Cache-aside keys carry TTLs and
# are evictable; BullMQ queue keys carry none and are therefore protected.
resource "aws_elasticache_parameter_group" "main" {
  name   = "${var.project_name}-${var.environment}-redis7"
  family = "redis7"

  parameter {
    name  = "maxmemory-policy"
    value = "volatile-lru"
  }
}

resource "aws_elasticache_cluster" "main" {
  cluster_id           = "${var.project_name}-${var.environment}"
  engine               = "redis"
  engine_version       = "7.1"
  node_type            = var.cache_node_type
  num_cache_nodes      = 1
  port                 = 6379
  az_mode              = "single-az"
  availability_zone    = var.availability_zone
  parameter_group_name = aws_elasticache_parameter_group.main.name
  subnet_group_name    = aws_elasticache_subnet_group.main.name
  security_group_ids   = [aws_security_group.cache.id]
  apply_immediately    = true

  tags = {
    Name        = "${var.project_name}-${var.environment}"
    Environment = var.environment
  }
}
