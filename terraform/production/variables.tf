variable "aws_region" {
  description = "Primary AWS region"
  default     = "ap-south-1"
}

variable "project_name" {
  default = "materialhub"
}

variable "environment" {
  default = "production"
}

variable "instance_type" {
  description = "EC2 instance type for the app host"
  default     = "t3a.large"
}

variable "availability_zone" {
  description = "AZ for the EC2 instance, EBS volume, RDS, and cache"
  default     = "ap-south-1b"
}

variable "key_name" {
  description = "Optional EC2 key pair name. No inbound SSH is open; left null by default."
  type        = string
  default     = null
}

variable "ebs_data_size" {
  description = "Size of the persistent Typesense/Caddy data volume in GB"
  default     = 20
}

variable "db_username" {
  description = "RDS master username"
  type        = string
  sensitive   = true
  default     = "materialhub"
}

variable "db_name" {
  default = "materialhub_production"
}

variable "db_instance_class" {
  default = "db.t4g.medium"
}

variable "db_allocated_storage" {
  description = "Initial RDS storage in GB"
  default     = 50
}

variable "db_max_allocated_storage" {
  description = "Storage autoscaling ceiling in GB"
  default     = 200
}

variable "cache_node_type" {
  default = "cache.t4g.small"
}

variable "github_repo" {
  description = "GitHub repo in owner/name format"
  type        = string
  default     = "ismailfarisi/ecom"
}

variable "domain_name" {
  description = "Root domain with an existing Route 53 hosted zone"
  default     = "materialhubuae.com"
}

variable "api_subdomain" {
  description = "FQDN for the backend API (Caddy terminates TLS here)"
  default     = "api.materialhubuae.com"
}

variable "cdn_subdomain" {
  description = "FQDN for the CloudFront media CDN"
  default     = "cdn.materialhubuae.com"
}

variable "feed_subdomain" {
  description = "Public subdomain serving sales-channel feed files via CloudFront"
  type        = string
  default     = "feeds.materialhubuae.com"
}

variable "vendor_dashboard_url" {
  description = "Public URL of the vendor dashboard frontend (used in vendor-invite links)"
  default     = "https://vendor.materialhubuae.com"
}

variable "admin_panel_url" {
  description = "Public URL of the admin panel frontend"
  default     = "https://admin.materialhubuae.com"
}

variable "frontend_instance_type" {
  description = "EC2 instance type for the frontend host (web, vendor-dashboard, admin-panel)"
  default     = "t3a.small"
}

variable "frontend_dns_enabled" {
  # Keep false. materialhubuae.com is served by Cloudflare DNS (lou/heidi.ns.cloudflare.com),
  # not this Route 53 zone, so these records would be inert. The four hosts were
  # pointed at the frontend EIP in Cloudflare on 2026-10-27.
  description = "Create Route 53 A records for materialhubuae.com, www, sellers and admin. Inert while the domain is on Cloudflare DNS."
  type        = bool
  default     = false
}
