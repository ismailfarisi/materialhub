# terraform/shared

Account-global AWS resources that are **not** owned by any single environment.

## Why this exists

Staging moved off AWS to Netcup (see `docker-compose.netcup.yml` and
`deploy-staging-netcup.yml`). The `terraform/staging` stack was decommissioned,
but a few resources it used to declare are shared with — and still relied on
by — production (which is still on AWS in the same account):

| Resource | Why it's shared |
|---|---|
| `aws_iam_openid_connect_provider.github` | AWS allows one OIDC provider per URL per account; both envs' CI use it. |
| `aws_iam_role.github_actions` (+ base policy) | `terraform/production/cicd.tf` looks this role up via `data` and attaches a prod-scoped policy. The base policy here grants ECR auth + push, used by all CI builds. |
| `aws_ecr_repository.services` (+ lifecycle) | `build-service.yml` pushes both staging and prod images to the same `materialhub-<service>` repos. |

These resources were transferred from the staging state with
`terraform state mv` (no recreate). Destroying them would break production
CI/CD and image pulls.

## When prod also leaves AWS

Once production is migrated off AWS, this whole config can be destroyed too.

## Usage

```bash
cp terraform.tfvars.example terraform.tfvars   # set github_repo
terraform init
terraform plan
```
