# ─── ECR Repositories (shared across environments) ───────────
# Both staging and production builds push to these repos (see
# .github/workflows/build-service.yml — images are tagged :<sha> and
# :<environment> in the same materialhub-<service> repo). They were originally
# declared in terraform/staging; moved here when staging migrated to Netcup so
# production image pulls keep working. Managed in state via `terraform state mv`
# from terraform/staging — do NOT recreate.
resource "aws_ecr_repository" "services" {
  for_each = toset(var.services)

  name                 = "${var.project_name}-${each.value}"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Shared = "true"
  }

  # The CI `terraform` user lacks ecr:UntagResource, and the repos were
  # imported with their original { Environment = "staging" } tag. Ignore tag
  # drift so plans stay clean without needing the extra permission.
  lifecycle {
    ignore_changes = [tags, tags_all]
  }
}

# Lifecycle policy — keep only last 5 images per repo
resource "aws_ecr_lifecycle_policy" "services" {
  for_each   = aws_ecr_repository.services
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
