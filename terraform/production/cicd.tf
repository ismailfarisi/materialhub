# The GitHub Actions OIDC role is account-global, created by terraform/shared
# (moved there from terraform/staging when staging migrated to Netcup).
# Production only adds a policy for the prod SSM path, prod KMS key, and the
# SSM Run Command deploy.
data "aws_iam_role" "github_actions" {
  name = "${var.project_name}-github-actions-role"
}

resource "aws_iam_role_policy" "github_actions_production" {
  name = "${var.project_name}-github-actions-production-policy"
  role = data.aws_iam_role.github_actions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # sync-secrets-to-ssm job writes /materialhub/production/*
        Effect = "Allow"
        Action = [
          "ssm:PutParameter",
          "ssm:GetParameter",
          "ssm:GetParameters",
          "ssm:GetParametersByPath",
        ]
        Resource = "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter/${var.project_name}/${var.environment}/*"
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:GenerateDataKey",
          "kms:DescribeKey",
        ]
        Resource = aws_kms_key.ssm.arn
      },
      {
        # deploy-backend job runs the deploy script on the prod box.
        Effect = "Allow"
        Action = ["ssm:SendCommand"]
        Resource = [
          "arn:aws:ssm:${var.aws_region}::document/AWS-RunShellScript",
          "arn:aws:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:instance/${aws_instance.app.id}",
        ]
      },
      {
        # Polling the command result is not resource-scopable.
        Effect   = "Allow"
        Action   = ["ssm:GetCommandInvocation"]
        Resource = "*"
      },
      {
        # deploy-backend uploads refresh-env-from-ssm.sh to s3 so the box's
        # SSM script can pull the latest version. Without this, edits to the
        # script in-repo are silently ignored on prod (the box keeps reading
        # whatever was last uploaded by hand).
        Effect   = "Allow"
        Action   = ["s3:PutObject"]
        Resource = "arn:aws:s3:::materialhub-config-prod/scripts/*"
      },
    ]
  })
}
