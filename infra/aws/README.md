# LastWord — AWS Infrastructure

This directory contains reference IAM policies and setup documentation
for deploying LastWord to AWS. **No real credentials or live resources
are stored here.**

## Subdirectories

- `iam-policies/` — Least-privilege IAM policy documents for EC2 and Lambda roles.
- `eventbridge-rule.json` — EventBridge scheduled rule definition.

## Setup Order

1. Create VPC with public + private subnets.
2. Create RDS PostgreSQL in the private subnet.
3. Create S3 bucket with SSE-S3 encryption.
4. Store secrets in SSM Parameter Store.
5. Create IAM roles (EC2 + Lambda).
6. Launch EC2 in the public subnet with the instance role.
7. Deploy Lambda with VPC access and the execution role.
8. Create EventBridge rule to invoke Lambda on schedule.
9. Create SNS topic and email subscriptions.
10. Configure CloudWatch log groups.

> Detailed deployment steps are in `docs/deployment.md` (to be added).

