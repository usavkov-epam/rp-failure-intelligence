# AWS infrastructure setup

The CDK application creates a DynamoDB table, a stream notifier Lambda, an SQS dead-letter queue, a Vercel OIDC application role, and a narrowly scoped GitHub Actions deployment role.

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

Apply a lifecycle policy to the CDK bootstrap bucket when the account does not already manage asset retention.

## 3. Synthesize and review

Set deployment-only variables in the shell:

```bash
export CDK_DEFAULT_ACCOUNT='<account-id>'
export AWS_REGION='us-east-1'
export CDK_DEFAULT_REGION="$AWS_REGION"
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
- `GITHUB_OIDC_PROVIDER_ARN` reuses an existing `token.actions.githubusercontent.com` provider in the account. Set it before the first deployment when another stack owns that provider.

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

## 5. Enable GitHub Actions infrastructure operations

The first deployment must be performed manually because the GitHub deployment role does not exist yet. The stack output named `GitHubDeploymentRoleArn` is the only AWS identity the workflow needs; never create GitHub access-key secrets.

Create a GitHub environment named `aws-production`. Add a required reviewer and restrict deployment branches to `main`. The IAM trust policy requires this environment and this repository's immutable owner/repository IDs, so workflows from forks, renamed namespaces, pull requests, or other environments cannot assume the role.

Configure these repository variables under **Settings → Secrets and variables → Actions → Variables**:

| Variable | Value |
| --- | --- |
| `AWS_ACCOUNT_ID` | The deployed AWS account ID |
| `AWS_DEPLOYMENT_ENVIRONMENT` | `aws-production` |
| `AWS_DEPLOY_ROLE_ARN` | `GitHubDeploymentRoleArn` stack output |
| `AWS_REGION` | `AwsRegion` stack output |
| `AWS_DYNAMODB_TABLE` | `DynamoDbTableName` stack output |
| `WEB_PUSH_PUBLIC_KEY` | `WebPushPublicKey` stack output |
| `WEB_PUSH_PRIVATE_KEY_PARAMETER` | `/failure-intelligence/web-push-private-key` unless overridden |
| `VAPID_SUBJECT` | The same `mailto:` subject used for the manual deployment |
| `VERCEL_TEAM_SLUG` | `yury-saukous-projects` |
| `VERCEL_PROJECT_NAME` | `rp-failure-intelligence` |

Set `VERCEL_OIDC_PROVIDER_ARN` or `GITHUB_OIDC_PROVIDER_ARN` only when the corresponding provider is owned by another stack.

The **AWS infrastructure** workflow is manual-only. Select `deploy` to show the CDK diff and deploy every stack. Select `destroy` and type `DESTROY` exactly to destroy the CloudFormation stacks. The protected GitHub environment provides the human approval gate, allowing the non-interactive CDK deploy command to use `--require-approval never` safely.

Destroy intentionally retains the DynamoDB table. It also leaves the CDK bootstrap bucket and roles, the SSM Web Push private-key parameter, GitHub variables, and the GitHub environment in place. Remove those resources explicitly only after reviewing their data and shared use.

## 6. Configure Vercel

Configure these Vercel production environment variables. Values labeled as outputs come from CDK:

```text
APP_MODE=hosted
TEST_RUNNER=github-actions
AUTH_SECRET=<new random Auth.js secret>
AUTH_GITHUB_ID=<GitHub OAuth App client ID>
AUTH_GITHUB_SECRET=<GitHub OAuth App client secret>
AUTHORIZATION_MODE=organization
AUTH_ALLOWED_ORGS=<comma-separated GitHub organizations>
AUTH_ALLOWED_USERS=
AUTH_TRUST_HOST=true
AWS_REGION=<AwsRegion output>
AWS_DYNAMODB_TABLE=<DynamoDbTableName output>
AWS_ROLE_ARN=<ApplicationRoleArn output>
WEB_PUSH_PUBLIC_KEY=<WebPushPublicKey output>
DATA_ENCRYPTION_KEY=<new random value of at least 32 characters>
```

For explicit-user authorization, set `AUTHORIZATION_MODE=users`, populate `AUTH_ALLOWED_USERS`, and leave `AUTH_ALLOWED_ORGS` empty. At least one value is required in the selected allowlist. `DATA_ENCRYPTION_KEY` and `AUTH_SECRET` are independent server secrets. Never put either value in CDK output, source control, or browser-visible variables. Vercel automatically supplies its OIDC token.

GitHub Actions dispatch, test-source repositories, source links, and webhook credentials are configured per user under **Settings → Integrations → GitHub**. ReportPortal and TestRail credentials are also configured in Settings rather than deployment variables.

## 7. GitHub webhook

Create a repository webhook for the `workflow_run` event at:

```text
https://<application-host>/api/webhooks/github
```

For each connected GitHub Actions repository, create a `workflow_run` webhook and enter the same strong secret in that user's GitHub integration dialog. The route resolves the run owner before validating the owner-scoped secret and expected repository/workflow. It writes the run update to DynamoDB, and the stream notifier delivers it to browsers, so no polling service or second webhook endpoint is needed.

## Cost guardrails

The stack fixes DynamoDB at 5 RCU and 5 WCU and omits autoscaling, global tables, indexes, backups, and PITR. Lambda uses 256 MB with no provisioned concurrency. SQS is used only after exhausted stream retries. Logs expire after seven days.

AWS free-tier quotas are aggregated across the payer account. Exceeding DynamoDB capacity/storage/stream reads, Lambda requests/duration, SQS requests, CloudWatch Logs, data transfer, or S3 usage can create charges. Enable AWS Budgets and free-tier usage alerts; "free-tier-shaped" infrastructure is not a billing guarantee.

Current allowance details should always be checked against the official AWS pricing pages before deployment:

- [DynamoDB pricing](https://aws.amazon.com/dynamodb/pricing/)
- [Lambda pricing](https://aws.amazon.com/lambda/pricing/)
- [SQS pricing](https://aws.amazon.com/sqs/pricing/)
- [CloudWatch pricing](https://aws.amazon.com/cloudwatch/pricing/)
