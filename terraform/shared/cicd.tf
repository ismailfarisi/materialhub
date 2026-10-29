# ─── GitHub Actions OIDC Provider (account-global) ────────────
# Lets GitHub Actions assume an IAM role without storing static AWS keys.
# AWS permits exactly one OIDC provider per URL per account, so this is shared
# by every environment. Originally declared in terraform/staging; moved here
# when staging migrated to Netcup. terraform/production/cicd.tf does a
# `data "aws_iam_role" "github_actions"` lookup against the role below and
# attaches its own prod-scoped policy — do NOT destroy these while prod is
# still on AWS.
resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]

  tags = {
    Name = "github-actions-oidc"
  }
}

# ─── IAM Role for GitHub Actions ──────────────────────────────
resource "aws_iam_role" "github_actions" {
  name = "${var.project_name}-github-actions-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Federated = aws_iam_openid_connect_provider.github.arn
      }
      Action = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        }
        StringLike = {
          "token.actions.githubusercontent.com:sub" = "repo:${var.github_repo}:*"
        }
      }
    }]
  })
}

# Base policy: ECR auth + push to the shared service repos. This is the only
# grant of ecr:GetAuthorizationToken / ECR push for CI, used by BOTH staging
# and production builds. Environment-specific permissions (prod SSM/KMS/deploy)
# are attached separately in terraform/production/cicd.tf.
#
# NOTE: the staging-specific SSM (PutParameter on /materialhub/staging/*) and KMS
# statements that used to live here were dropped when staging moved off AWS —
# the legacy AWS staging deploy and its SSM params no longer exist.
resource "aws_iam_role_policy" "github_actions" {
  name = "${var.project_name}-github-actions-policy"
  role = aws_iam_role.github_actions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken",
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "ecr:BatchGetImage",
          "ecr:BatchCheckLayerAvailability",
          "ecr:CompleteLayerUpload",
          "ecr:GetDownloadUrlForLayer",
          "ecr:InitiateLayerUpload",
          "ecr:PutImage",
          "ecr:UploadLayerPart",
        ]
        Resource = [for repo in aws_ecr_repository.services : repo.arn]
      },
    ]
  })
}
