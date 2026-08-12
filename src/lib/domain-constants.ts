/**
 * Shared domain vocabulary and operational limits.
 *
 * Keeping these values in one dependency-free module lets browser, server, tests,
 * and infrastructure code agree without importing environment-specific modules.
 */
export const APP_MODE = {
  HOSTED: "hosted",
  LOCAL: "local",
} as const;

export const TEST_RUNNER_KIND = {
  GITHUB_ACTIONS: "github-actions",
  LOCAL_CLI: "local-cli",
} as const;

export type TestRunnerKind = typeof TEST_RUNNER_KIND[keyof typeof TEST_RUNNER_KIND];

export const RUN_STATUS = {
  QUEUED: "queued",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
} as const;

export const RUN_CONCLUSION = {
  SUCCESS: "success",
  FAILURE: "failure",
  CANCELLED: "cancelled",
  CANCELLING: "cancelling",
  TIMED_OUT: "timed_out",
  DISPATCH_FAILURE: "dispatch_failure",
  SETUP_FAILURE: "setup_failure",
  RUNNER_FAILURE: "runner_failure",
  CONTAINER_RESTARTED: "container_restarted",
} as const;

export const CANCELLATION_RESULT = {
  CANCELLED: "cancelled",
  NOT_ACTIVE: "not-active",
  UNSUPPORTED: "unsupported",
} as const;

export const REPORT_STATUS = {
  PASSED: "PASSED",
  FAILED: "FAILED",
  IN_PROGRESS: "IN_PROGRESS",
} as const;

export const RISK = {
  PERSISTENT: "Persistent",
  HIGH: "High risk",
  INTERMITTENT: "Intermittent",
  ISOLATED: "Isolated",
} as const;

export const ANALYTICS = {
  HIGH_RISK_FAILURE_COUNT: 8,
  ISOLATED_FAILURE_COUNT: 1,
  PERCENT_MULTIPLIER: 100,
} as const;

export const CYPRESS_BROWSER = {
  CHROME: "chrome",
  ELECTRON: "electron",
} as const;

export const RUN_LIMITS = {
  MAX_SPECS: 25,
  MIN_REPETITIONS: 1,
  MAX_REPETITIONS: 20,
  MIN_THREADS: 1,
  MAX_THREADS: 4,
  MIN_TIMEOUT_SECONDS: 60,
  MAX_TIMEOUT_SECONDS: 1_200,
  LIST_SIZE: 20,
  LOCAL_HISTORY_SIZE: 100,
} as const;

export const RUN_DEFAULTS = {
  REPETITIONS: 5,
  THREADS: 1,
  BROWSER: CYPRESS_BROWSER.CHROME,
  TIMEOUT_SECONDS: 600,
} as const;

export const DISPLAY = {
  REQUEST_ID_LENGTH: 8,
  HISTORY_DEPTH_OPTIONS: [5, 10, 15, 20, 30],
} as const;

export const PAGINATION = {
  FIRST_PAGE: 1,
  DEFAULT_CONCURRENCY: 5,
} as const;

export const FORM_VALUE = {
  ANY: "all",
  REPORT_ANY: "__any",
  INHERIT: "inherit",
} as const;

export const SPEC_PATH_COPY_FORMAT = {
  COMMA_SEPARATED: "comma-separated",
  NEW_LINE_SEPARATED: "new-line-separated",
} as const;

export type SpecPathCopyFormat = typeof SPEC_PATH_COPY_FORMAT[keyof typeof SPEC_PATH_COPY_FORMAT];

export const TIME = {
  MILLISECONDS_PER_SECOND: 1_000,
  SECONDS_PER_HOUR: 3_600,
  PROFILE_SNAPSHOT_TTL_SECONDS: 3_600,
  LOCAL_STATUS_REFRESH_MILLISECONDS: 5_000,
  ACTIVE_PROJECT_COOKIE_MAX_AGE_SECONDS: 31_536_000,
} as const;

export const DYNAMO_ENTITY = {
  DASHBOARD_SETTINGS: "DASHBOARD_SETTINGS",
  CYPRESS_PROFILE: "CYPRESS_PROFILE",
  CYPRESS_RUN: "CYPRESS_RUN",
  CYPRESS_RUN_LOOKUP: "CYPRESS_RUN_LOOKUP",
  RUN_PROFILE_SNAPSHOT: "RUN_PROFILE_SNAPSHOT",
  WEB_PUSH_SUBSCRIPTION: "WEB_PUSH_SUBSCRIPTION",
} as const;

export const DYNAMO_KEY = {
  SETTINGS: "SETTINGS",
  LOOKUP: "LOOKUP",
  SNAPSHOT: "SNAPSHOT",
  OWNER_PREFIX: "OWNER#",
  PROFILE_PREFIX: "PROFILE#",
  RUN_PREFIX: "RUN#",
  RUN_LOOKUP_PREFIX: "RUN_LOOKUP#",
  SNAPSHOT_PREFIX: "SNAPSHOT#",
  PUSH_PREFIX: "PUSH#",
} as const;

export const DYNAMO_ATTRIBUTE = {
  PARTITION_KEY: "pk",
  SORT_KEY: "sk",
  TTL: "expiresAtEpoch",
} as const;

export const PUSH_MESSAGE_TYPE = {
  CYPRESS_RUN_UPDATED: "CYPRESS_RUN_UPDATED",
} as const;

export const GITHUB = {
  API_BASE_URL: "https://api.github.com",
  WEB_BASE_URL: "https://github.com",
  API_ACCEPT: "application/vnd.github+json",
  API_VERSION: "2022-11-28",
  ACTIONS_OIDC_ISSUER: "https://token.actions.githubusercontent.com",
  ACTIONS_EVENT: "workflow_run",
  ACTIONS_DISPATCH_EVENT: "workflow_dispatch",
  ACTIONS_RUNNER_ENVIRONMENT: "github-hosted",
  API_PAGE_SIZE: 100,
  ARTIFACT_REDIRECT_STATUS: 302,
} as const;

export const REPORT_PORTAL = {
  API_PAGE_SIZE: 200,
  HISTORY_API_PAGE_SIZE: 1_000,
  IN_PROGRESS_STATUS: REPORT_STATUS.IN_PROGRESS,
} as const;

export const HTTP_HEADER = {
  AUTHORIZATION: "authorization",
  CONTENT_TYPE: "content-type",
  CACHE_CONTROL: "Cache-Control",
  GITHUB_EVENT: "x-github-event",
  GITHUB_SIGNATURE: "x-hub-signature-256",
} as const;

export const AUTHORIZATION = {
  BEARER_PREFIX: "Bearer ",
  SHA256_SIGNATURE_PREFIX: "sha256=",
} as const;

export const VALIDATION_LIMITS = {
  MIN_ARN_LENGTH: 20,
  WEBHOOK_SECRET_MIN_LENGTH: 32,
  API_SECRET_LENGTH: 4_096,
  URL_LENGTH: 500,
  PUSH_ENDPOINT_LENGTH: 2_048,
  PUSH_PUBLIC_KEY_MIN_LENGTH: 20,
  PUSH_PUBLIC_KEY_MAX_LENGTH: 512,
  PUSH_AUTH_MIN_LENGTH: 8,
  PUSH_AUTH_MAX_LENGTH: 256,
  IDENTIFIER_LENGTH: 80,
  KEY_LENGTH: 100,
  LABEL_LENGTH: 100,
  FIELD_VALUE_LENGTH: 200,
  EMAIL_LENGTH: 320,
  SPEC_PATH_LENGTH: 300,
  REPORT_FIELDS: 12,
  FIELD_OPTIONS: 100,
  CLASSIFICATION_MAPPINGS: 100,
  CYPRESS_CONFIG_FIELDS: 30,
  PROFILE_MAPPINGS: 50,
  SOURCE_MAPPINGS: 50,
  PROFILE_VARIABLES: 50,
} as const;

export const MEDIA_TYPE = {
  JSON: "application/json",
  BINARY: "application/octet-stream",
} as const;

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  CONFLICT: 409,
  BAD_GATEWAY: 502,
} as const;
