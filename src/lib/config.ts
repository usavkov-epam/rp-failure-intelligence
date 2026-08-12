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
  APP_BASE_URL: z.string().url().optional(),
  VERCEL_PROJECT_PRODUCTION_URL: z.string().min(1).optional(),
  AUTH_SECRET: z.string().min(1).optional(),
  AUTH_GITHUB_ID: z.string().min(1).optional(),
  AUTH_GITHUB_SECRET: z.string().min(1).optional(),
  AUTHORIZATION_MODE: z.enum(["organization", "users"]).default("organization"),
  AUTH_ALLOWED_ORGS: commaSeparatedList,
  AUTH_ALLOWED_USERS: commaSeparatedList,
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
    if (!env.APP_BASE_URL && !env.VERCEL_PROJECT_PRODUCTION_URL) {
      context.addIssue({ code: "custom", path: ["APP_BASE_URL"], message: "APP_BASE_URL is required outside Vercel hosted deployments" });
    }
  }
  if (env.APP_MODE === APP_MODE.LOCAL && !env.LOCAL_ENCRYPTION_KEY) {
    context.addIssue({ code: "custom", path: ["LOCAL_ENCRYPTION_KEY"], message: "LOCAL_ENCRYPTION_KEY is required in local mode" });
  }
  if (env.APP_MODE === APP_MODE.LOCAL) {
    for (const key of ["LOCAL_RUNNER_REPOSITORY_URL", "LOCAL_RUNNER_REF"] as const) {
      if (!env[key]) context.addIssue({ code: "custom", path: [key], message: `${key} is required in local mode` });
    }
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
const applicationBaseUrl = (
  env.APP_BASE_URL
  || (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:8080")
).replace(/\/$/, "");

export const config = {
  mode: env.APP_MODE,
  isLocal: env.APP_MODE === APP_MODE.LOCAL,
  appName: env.APP_NAME,
  applicationBaseUrl,
  auth: {
    notificationSecret: env.AUTH_SECRET || env.LOCAL_ENCRYPTION_KEY || "",
    authorizationMode: env.AUTHORIZATION_MODE,
    allowedOrganizations: env.AUTH_ALLOWED_ORGS,
    allowedUsers: env.AUTH_ALLOWED_USERS,
  },
  testRunner: {
    kind: testRunnerKind,
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
    repositoryUrl: env.LOCAL_RUNNER_REPOSITORY_URL || "",
    ref: env.LOCAL_RUNNER_REF || "",
    workspaceDirectory: `${env.LOCAL_DATA_DIR}/runner/project`,
    runsDirectory: `${env.LOCAL_DATA_DIR}/runner/runs`,
  },
} as const;
