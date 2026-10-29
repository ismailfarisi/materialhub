output "github_actions_role_arn" {
  description = "Set this as the AWS_ROLE_ARN GitHub secret"
  value       = aws_iam_role.github_actions.arn
}

output "ecr_repositories" {
  description = "ECR repository URLs"
  value       = { for k, v in aws_ecr_repository.services : k => v.repository_url }
}
