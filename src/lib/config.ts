import "server-only";

import { z } from "zod";

import { APP_MODE, TEST_RUNNER_KIND, VALIDATION_LIMITS } from "./domain-constants";

const commaSeparatedList = z.string().default("").transform((value) => (
  value.split(",").map((item) => item.trim()).filter(Boolean)
));

const environmentSchema = z.object({
  APP_MODE: z.enum([APP_MODE.HOSTED, APP_MODE.LOCAL]).default(APP_MODE.HOSTED),
  TEST_RUNNER: z.enum([TEST_RUNNER_KIND.GITHUB_ACTIONS, TEST_RUNNER_KIND.LOCAL_CLI]).optional(),
  APP_NAME: z.string().min(1).default("Failure intelligence"),
  AUTH_SECRET: z.string().min(1).optional(),
  AUTH_GITHUB_ID: z.string().min(1).optional(),
  AUTH_GITHUB_SECRET: z.string().min(1).optional(),
  AUTHORIZATION_MODE: z.enum(["organization", "users"]).default("organization"),
  AUTH_ALLOWED_ORGS: commaSeparatedList,
  AUTH_ALLOWED_USERS: commaSeparatedList,
  GITHUB_ACTIONS_TOKEN: z.string().min(1).optional(),
  GITHUB_ACTIONS_OWNER: z.string().min(1).default("usavkov-epam"),
  GITHUB_ACTIONS_REPO: z.string().min(1).default("rp-failure-intelligence"),
  GITHUB_ACTIONS_WORKFLOW: z.string().min(1).default("cypress-selected-specs.yml"),
  GITHUB_ACTIONS_REF: z.string().min(1).default("main"),
  GITHUB_WEBHOOK_SECRET: z.string().min(32).optional(),
  GITHUB_SOURCE_OWNER: z.string().min(1).default("folio-org"),
  GITHUB_SOURCE_REPO: z.string().min(1).default("stripes-testing"),
  GITHUB_SOURCE_REF: z.string().min(1).default("master"),
  AWS_REGION: z.string().min(1).default("us-east-1"),
  AWS_DYNAMODB_TABLE: z.string().min(3).optional(),
  AWS_ROLE_ARN: z.string().min(VALIDATION_LIMITS.MIN_ARN_LENGTH).optional(),
  DATA_ENCRYPTION_KEY: z.string().min(32).optional(),
  WEB_PUSH_PUBLIC_KEY: z.string().min(VALIDATION_LIMITS.PUSH_PUBLIC_KEY_MIN_LENGTH).optional(),
  LOCAL_DATA_DIR: z.string().min(1).default(".failure-intelligence"),
  LOCAL_ENCRYPTION_KEY: z.string().min(32).optional(),
  LOCAL_RUNNER_REPOSITORY_URL: z.string().url().optional(),
  LOCAL_RUNNER_REF: z.string().min(1).optional(),
}).superRefine((env, context) => {
  const supportedRunner = env.APP_MODE === APP_MODE.LOCAL
    ? TEST_RUNNER_KIND.LOCAL_CLI
    : TEST_RUNNER_KIND.GITHUB_ACTIONS;
  if (env.TEST_RUNNER && env.TEST_RUNNER !== supportedRunner) {
    context.addIssue({
      code: "custom",
      path: ["TEST_RUNNER"],
      message: `${env.APP_MODE} mode currently supports only ${supportedRunner}`,
    });
  }
  if (env.APP_MODE === APP_MODE.HOSTED) {
    for (const key of ["AUTH_SECRET", "AUTH_GITHUB_ID", "AUTH_GITHUB_SECRET", "AWS_DYNAMODB_TABLE", "DATA_ENCRYPTION_KEY", "WEB_PUSH_PUBLIC_KEY"] as const) {
      if (!env[key]) context.addIssue({ code: "custom", path: [key], message: `${key} is required in hosted mode` });
    }
  }
  if (env.APP_MODE === APP_MODE.LOCAL && !env.LOCAL_ENCRYPTION_KEY) {
    context.addIssue({ code: "custom", path: ["LOCAL_ENCRYPTION_KEY"], message: "LOCAL_ENCRYPTION_KEY is required in local mode" });
  }
  const allowlist = env.AUTHORIZATION_MODE === "organization" ? env.AUTH_ALLOWED_ORGS : env.AUTH_ALLOWED_USERS;
  if (env.APP_MODE === APP_MODE.HOSTED && !allowlist.length) {
    context.addIssue({
      code: "custom",
      path: [env.AUTHORIZATION_MODE === "organization" ? "AUTH_ALLOWED_ORGS" : "AUTH_ALLOWED_USERS"],
      message: `At least one entry is required in ${env.AUTHORIZATION_MODE} authorization mode`,
    });
  }
});

const parsed = environmentSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${z.prettifyError(parsed.error)}`);
}

const env = parsed.data;
const testRunnerKind = env.TEST_RUNNER || (
  env.APP_MODE === APP_MODE.LOCAL ? TEST_RUNNER_KIND.LOCAL_CLI : TEST_RUNNER_KIND.GITHUB_ACTIONS
);

export const config = {
  mode: env.APP_MODE,
  isLocal: env.APP_MODE === APP_MODE.LOCAL,
  appName: env.APP_NAME,
  auth: {
    notificationSecret: env.AUTH_SECRET || env.LOCAL_ENCRYPTION_KEY || "",
    authorizationMode: env.AUTHORIZATION_MODE,
    allowedOrganizations: env.AUTH_ALLOWED_ORGS,
    allowedUsers: env.AUTH_ALLOWED_USERS,
  },
  githubActions: {
    token: env.GITHUB_ACTIONS_TOKEN,
    owner: env.GITHUB_ACTIONS_OWNER,
    repository: env.GITHUB_ACTIONS_REPO,
    workflow: env.GITHUB_ACTIONS_WORKFLOW,
    ref: env.GITHUB_ACTIONS_REF,
  },
  testRunner: {
    kind: testRunnerKind,
  },
  githubWebhook: {
    secret: env.GITHUB_WEBHOOK_SECRET,
  },
  githubSource: {
    owner: env.GITHUB_SOURCE_OWNER,
    repository: env.GITHUB_SOURCE_REPO,
    ref: env.GITHUB_SOURCE_REF,
  },
  aws: {
    region: env.AWS_REGION,
    tableName: env.AWS_DYNAMODB_TABLE,
    roleArn: env.AWS_ROLE_ARN,
    dataEncryptionKey: env.DATA_ENCRYPTION_KEY,
    webPushPublicKey: env.WEB_PUSH_PUBLIC_KEY,
  },
  localStorage: {
    dataDirectory: env.LOCAL_DATA_DIR,
    encryptionKey: env.LOCAL_ENCRYPTION_KEY,
  },
  localRunner: {
    repositoryUrl: env.LOCAL_RUNNER_REPOSITORY_URL || `https://github.com/${env.GITHUB_SOURCE_OWNER}/${env.GITHUB_SOURCE_REPO}.git`,
    ref: env.LOCAL_RUNNER_REF || env.GITHUB_SOURCE_REF,
    workspaceDirectory: `${env.LOCAL_DATA_DIR}/runner/project`,
    runsDirectory: `${env.LOCAL_DATA_DIR}/runner/runs`,
  },
} as const;
