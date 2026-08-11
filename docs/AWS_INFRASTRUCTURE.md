# AWS infrastructure setup

This is a clean AWS deployment. Do not apply the removed Supabase migrations and do not copy Supabase data. The CDK application creates a DynamoDB table, a stream notifier Lambda, an SQS dead-letter queue, and a Vercel OIDC role.

## 1. Generate Web Push keys

Generate one VAPID pair and keep the private key secret:

```bash
pnpm exec web-push generate-vapid-keys
```

Store the private key in an SSM **Standard SecureString** in the deployment region. CDK intentionally does not receive or write the secret value:

```bash
aws ssm put-parameter \
  --name /failure-intelligence/web-push-private-key \
  --type SecureString \
  --value '<private-key>'
```

The default AWS-managed SSM encryption key is used; do not create a customer-managed KMS key for this application.

## 2. Bootstrap CDK once

CDK needs its standard bootstrap S3 bucket and deployment roles. This is the acknowledged S3 usage:

```bash
pnpm exec cdk bootstrap aws://<account-id>/<region>
```

Delete old CDK assets periodically if account policy does not already manage them.

## 3. Synthesize and review

Set deployment-only variables in the shell:

```bash
export CDK_DEFAULT_ACCOUNT='<account-id>'
export CDK_DEFAULT_REGION='us-east-1'
export VERCEL_TEAM_SLUG='<vercel-team-slug>'
export VERCEL_PROJECT_NAME='<vercel-project-name>'
export WEB_PUSH_PUBLIC_KEY='<public-key>'
export VAPID_SUBJECT='mailto:<operations-email>'
```

In Vercel, open **Project Settings → Security → Secure backend access with OIDC federation** and select the recommended **Team** issuer mode. The stack's issuer and exact IAM claims are built for that mode.

Optional variables:

- `AWS_DYNAMODB_TABLE` changes the default `rp-failure-intelligence` table name.
- `WEB_PUSH_PRIVATE_KEY_PARAMETER` changes the default `/failure-intelligence/web-push-private-key` parameter path.
- `VERCEL_OIDC_PROVIDER_ARN` reuses an existing provider for the same Vercel team. Set it when another project already created `oidc.vercel.com/<team-slug>` in this AWS account; AWS permits only one provider per issuer URL.

Review before deploying:

```bash
pnpm infra:synth
pnpm infra:diff
```

## 4. Deploy

```bash
pnpm infra:deploy
```

The command keeps CDK's IAM-broadening approval prompt. It must not be automated away. The table has deletion protection and a retained removal policy.

## 5. Configure Vercel

Copy the CDK outputs to Vercel production environment variables:

```text
AWS_REGION=<AwsRegion output>
AWS_DYNAMODB_TABLE=<DynamoDbTableName output>
AWS_ROLE_ARN=<ApplicationRoleArn output>
WEB_PUSH_PUBLIC_KEY=<WebPushPublicKey output>
DATA_ENCRYPTION_KEY=<new random value of at least 32 characters>
```

`DATA_ENCRYPTION_KEY` is a server secret. Generate it independently and never put it in CDK output, source control, or browser-visible variables. Vercel automatically supplies its OIDC token; do not add `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY`.

Keep the existing hosted variables for Auth.js, GitHub OAuth, GitHub Actions dispatch, source links, and the GitHub webhook. Remove all old `NEXT_PUBLIC_SUPABASE_*` and `SUPABASE_*` variables.

## 6. GitHub webhook

Keep the GitHub App/repository `workflow_run` webhook pointed at:

```text
https://<application-host>/api/webhooks/github
```

Use the same strong value for the webhook configuration and `GITHUB_WEBHOOK_SECRET`. The route writes the run update to DynamoDB. The stream notifier delivers it to browsers, so no polling service or second webhook endpoint is needed.

## Cost guardrails

The stack fixes DynamoDB at 5 RCU and 5 WCU and omits autoscaling, global tables, indexes, backups, and PITR. Lambda uses 256 MB with no provisioned concurrency. SQS is used only after exhausted stream retries. Logs expire after seven days.

AWS free-tier quotas are aggregated across the payer account. Exceeding DynamoDB capacity/storage/stream reads, Lambda requests/duration, SQS requests, CloudWatch Logs, data transfer, or S3 usage can create charges. Enable AWS Budgets and free-tier usage alerts; "free-tier-shaped" infrastructure is not a billing guarantee.

Current allowance details should always be checked against the official AWS pricing pages before deployment:

- [DynamoDB pricing](https://aws.amazon.com/dynamodb/pricing/)
- [Lambda pricing](https://aws.amazon.com/lambda/pricing/)
- [SQS pricing](https://aws.amazon.com/sqs/pricing/)
- [CloudWatch pricing](https://aws.amazon.com/cloudwatch/pricing/)
