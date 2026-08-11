export const INFRASTRUCTURE = {
  DEFAULT_REGION: "us-east-1",
  DEFAULT_TABLE_NAME: "rp-failure-intelligence",
  DEFAULT_PUSH_PRIVATE_KEY_PARAMETER: "/failure-intelligence/web-push-private-key",
  DEFAULT_VAPID_SUBJECT: "mailto:admin@example.com",
  DYNAMODB_READ_CAPACITY: 5,
  DYNAMODB_WRITE_CAPACITY: 5,
  NOTIFIER_FUNCTION_NAME: "failure-intelligence-push-notifier",
  NOTIFIER_MEMORY_MB: 256,
  NOTIFIER_TIMEOUT_SECONDS: 30,
  STREAM_BATCH_SIZE: 10,
  STREAM_BATCH_WINDOW_SECONDS: 2,
  STREAM_RETRY_ATTEMPTS: 2,
  DLQ_RETENTION_DAYS: 14,
  VERCEL_ROLE_NAME: "failure-intelligence-vercel-production",
  GITHUB_DEPLOYMENT_ROLE_NAME: "failure-intelligence-github-deployment",
  GITHUB_OIDC_PROVIDER_URL: "https://token.actions.githubusercontent.com",
  GITHUB_OIDC_AUDIENCE: "sts.amazonaws.com",
  GITHUB_DEPLOYMENT_ENVIRONMENT: "aws-production",
  GITHUB_REPOSITORY_OWNER: "usavkov-epam",
  GITHUB_REPOSITORY_NAME: "rp-failure-intelligence",
  GITHUB_REPOSITORY_OWNER_ID: "88109087",
  GITHUB_REPOSITORY_ID: "1325257981",
  CDK_BOOTSTRAP_QUALIFIER: "hnb659fds",
  CDK_BOOTSTRAP_VERSION_PARAMETER: "cdk-bootstrap/hnb659fds/version",
  CDK_BOOTSTRAP_ROLE_KINDS: ["deploy", "file-publishing", "image-publishing", "lookup"],
} as const;

export const STACK_ID = {
  STORAGE: "FailureIntelligenceStorage",
  NOTIFICATIONS: "FailureIntelligenceNotifications",
  VERCEL_ACCESS: "FailureIntelligenceVercelAccess",
  GITHUB_DEPLOYMENT_ACCESS: "FailureIntelligenceGitHubDeploymentAccess",
} as const;

export const AWS_SERVICE = {
  IAM: "iam",
  SSM: "ssm",
} as const;

export const IAM_ACTION = {
  ASSUME_ROLE: "sts:AssumeRole",
  ASSUME_ROLE_WITH_WEB_IDENTITY: "sts:AssumeRoleWithWebIdentity",
  GET_PARAMETER: "ssm:GetParameter",
} as const;

export const GITHUB_OIDC_CLAIM = {
  AUDIENCE: "aud",
  SUBJECT: "sub",
  REPOSITORY_PREFIX: "repo",
  ENVIRONMENT_CONTEXT: "environment",
} as const;
