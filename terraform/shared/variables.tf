variable "aws_region" {
  default = "ap-south-1"
}

variable "project_name" {
  default = "materialhub"
}

variable "github_repo" {
  description = "GitHub repo in owner/name format (e.g. ismailfarisi/ecom)"
  type        = string
}

# Container images are environment-independent: build-service.yml pushes both
# staging and production images into the same materialhub-<service> repository
# (tagged :<sha> and :<environment>). The repos therefore outlive any single
# environment and live in this shared config.
#
# The backend now runs as ONE process (backend/apps/api) and build-service.yml
# pushes that single image to materialhub-api-gateway, reused so the monolith
# needs no apply. The other repos no longer receive pushes but are kept: do
# not drop them from this list casually, it would delete the repos (and their
# images, force_delete = true) on the next apply.
variable "services" {
  default = [
    "api-gateway",
    "auth-service",
    "product-service",
    "order-service",
    "vendor-service",
    "notification-service",
    "cms-service",
    "integration-service",
  ]
}
