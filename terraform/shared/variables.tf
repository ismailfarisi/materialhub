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
