import "server-only";

import { z } from "zod";

const optionalUrl = z.string().url().optional();

const commaSeparatedList = z.string().default("").transform((value) => (
  value.split(",").map((item) => item.trim()).filter(Boolean)
));

const environmentSchema = z.object({
  APP_NAME: z.string().min(1).default("Failure intelligence"),
  AUTH_SECRET: z.string().min(1),
  AUTH_GITHUB_ID: z.string().min(1),
  AUTH_GITHUB_SECRET: z.string().min(1),
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
  NEXT_PUBLIC_SUPABASE_URL: optionalUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
}).superRefine((env, context) => {
  const allowlist = env.AUTHORIZATION_MODE === "organization" ? env.AUTH_ALLOWED_ORGS : env.AUTH_ALLOWED_USERS;
  if (!allowlist.length) {
    context.addIssue({
      code: "custom",
      path: [env.AUTHORIZATION_MODE === "organization" ? "AUTH_ALLOWED_ORGS" : "AUTH_ALLOWED_USERS"],
      message: `At least one entry is required in ${env.AUTHORIZATION_MODE} authorization mode`,
    });
  }
  const supabaseValues = [env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, env.SUPABASE_SERVICE_ROLE_KEY];
  if (supabaseValues.some(Boolean) && !supabaseValues.every(Boolean)) {
    context.addIssue({
      code: "custom",
      path: ["NEXT_PUBLIC_SUPABASE_URL"],
      message: "Supabase URL, anon key, and service-role key must be configured together",
    });
  }
});

const parsed = environmentSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${z.prettifyError(parsed.error)}`);
}

const env = parsed.data;

export const config = {
  appName: env.APP_NAME,
  auth: {
    notificationSecret: env.AUTH_SECRET,
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
  githubWebhook: {
    secret: env.GITHUB_WEBHOOK_SECRET,
  },
  githubSource: {
    owner: env.GITHUB_SOURCE_OWNER,
    repository: env.GITHUB_SOURCE_REPO,
    ref: env.GITHUB_SOURCE_REF,
  },
  supabase: {
    url: env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
  },
} as const;
