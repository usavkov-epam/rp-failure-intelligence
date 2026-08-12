# Failure intelligence

Failure intelligence is a project-agnostic ReportPortal dashboard for exploring Cypress failures, visualizing recent run history, and rerunning selected specs. Hosted deployments use GitHub OAuth, Vercel, and a small AWS serverless data layer. The separate local Docker image is self-contained and runs Cypress in the container.

## Capabilities

- ReportPortal project and launch analysis with sortable, filterable failure history.
- User-owned ReportPortal, TestRail, and GitHub integrations, custom report fields, classification labels, launch mappings, test-source mappings, and reusable Cypress profiles.
- Encrypted configuration and one-time run snapshots in DynamoDB.
- GitHub Actions dispatch and signed webhook tracking in hosted mode.
- DynamoDB Streams, Lambda, and Web Push for event-driven run updates without browser polling.
- GitHub OIDC deployment and destroy workflows without stored AWS access keys.
- Local Docker mode with encrypted volume storage and an in-container Cypress CLI runner.

## Hosted architecture

The hosted app is deployed separately from its AWS data layer:

1. Vercel runs the Next.js application and Auth.js GitHub sign-in.
2. Vercel exchanges its OIDC token for short-lived AWS credentials scoped to the production project. No AWS access key is stored in Vercel.
3. A single provisioned DynamoDB table stores encrypted settings, profiles, one-time snapshots, run metadata, and browser push subscriptions.
4. GitHub sends signed `workflow_run` webhooks to the Next.js webhook route.
5. DynamoDB Streams invokes a notifier Lambda. It sends Web Push messages to registered browsers; an SQS queue receives records that exhaust retries.

See [AWS infrastructure](docs/AWS_INFRASTRUCTURE.md) for provisioning, [engineering notes](docs/ENGINEERING.md) for security and data flow, [runner extensions](docs/TEST_RUNNERS.md), and [code quality conventions](docs/CODE_QUALITY.md).

## Development

Requirements: Node.js 22 and pnpm 10.

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Use `pnpm check` before requesting a commit. The CDK application can be checked independently with `pnpm infra:synth` after supplying the variables documented in `docs/AWS_INFRASTRUCTURE.md`.

## Local Docker

The `local` image runs the application and Cypress CLI on a developer workstation. Supply the Cypress repository URL and ref when starting it, then configure ReportPortal and Cypress profiles in the UI. Settings and run data are application-encrypted in the mounted Docker volume.

```bash
docker run -d \
  --name failure-intelligence \
  --restart unless-stopped \
  -p 127.0.0.1:8080:8080 \
  -v failure-intelligence-data:/data \
  -e LOCAL_RUNNER_REPOSITORY_URL=https://github.com/example/cypress-project.git \
  -e LOCAL_RUNNER_REF=main \
  ghcr.io/usavkov-epam/rp-failure-intelligence:local
```

Open `http://localhost:8080`, configure ReportPortal in Settings, create a Cypress profile, and use **Run selected**. The container clones the source repository and executes the configured Cypress command itself.

Complete local instructions and recovery guidance are in [Local Docker](docs/LOCAL_DOCKER.md).

## Security summary

- Hosted secrets and Cypress profile contents are encrypted with AES-256-GCM before DynamoDB writes. Ciphertext is bound to its owner and record context with authenticated additional data.
- Browser code never receives ReportPortal, TestRail, GitHub, AWS, profile, or data-encryption secrets.
- Vercel uses project/environment-bound OIDC and short-lived role credentials.
- The Web Push private key is a pre-created SSM Standard SecureString read only by the notifier Lambda. Its public key is safe to expose to browsers.
- One-time Cypress profile snapshots expire after one hour and are atomically deleted when consumed.
- DynamoDB uses AWS-owned encryption at rest, deletion protection, and a retained-table removal policy.
- Local mode deliberately has no login boundary and binds to loopback only; never expose it directly to a network.

Environment variable examples are in [.env.example](.env.example) and [.env.docker.example](.env.docker.example). Per-user integration credentials are configured in the application, not deployment variables.
