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
} as const;

export const STACK_ID = {
  STORAGE: "FailureIntelligenceStorage",
  NOTIFICATIONS: "FailureIntelligenceNotifications",
  VERCEL_ACCESS: "FailureIntelligenceVercelAccess",
} as const;
