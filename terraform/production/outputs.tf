output "ec2_instance_id" {
  description = "Set this as the PROD_EC2_INSTANCE_ID GitHub secret"
  value       = aws_instance.app.id
}

output "elastic_ip" {
  description = "Production app host public IP (also the api.materialhubuae.com A record)"
  value       = aws_eip.app.public_ip
}

output "rds_endpoint" {
  description = "RDS PostgreSQL endpoint hostname"
  value       = aws_db_instance.main.address
}

output "redis_endpoint" {
  description = "ElastiCache Redis primary node endpoint"
  value       = aws_elasticache_cluster.main.cache_nodes[0].address
}

output "cloudfront_domain" {
  description = "CloudFront distribution domain (cdn.materialhubuae.com aliases to this)"
  value       = aws_cloudfront_distribution.media.domain_name
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID (for cache invalidations)"
  value       = aws_cloudfront_distribution.media.id
}

output "media_bucket" {
  description = "Production media S3 bucket name"
  value       = aws_s3_bucket.media.id
}

output "data_volume_id" {
  description = "Persistent Typesense/Caddy EBS volume ID"
  value       = aws_ebs_volume.data.id
}

output "feed_bucket_name" {
  value       = aws_s3_bucket.channel_feeds.id
  description = "Sales-channel feed bucket name"
}

output "feed_cloudfront_domain" {
  value       = aws_cloudfront_distribution.channel_feeds.domain_name
  description = "CloudFront distribution domain serving feed files"
}

output "feed_cloudfront_id" {
  value       = aws_cloudfront_distribution.channel_feeds.id
  description = "CloudFront distribution ID (for cache invalidations)"
}

output "frontend_instance_id" {
  description = "Set this as the PROD_FRONTEND_EC2_INSTANCE_ID GitHub secret"
  value       = aws_instance.frontend.id
}

output "frontend_public_ip" {
  description = "Frontend host public IP (materialhubuae.com, www, sellers, admin once DNS is enabled)"
  value       = aws_eip.frontend.public_ip
}
