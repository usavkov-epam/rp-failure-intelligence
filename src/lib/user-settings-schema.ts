import { z } from "zod";

import { DISPLAY, VALIDATION_LIMITS } from "./domain-constants";

const optionalSecret = z.string().max(VALIDATION_LIMITS.API_SECRET_LENGTH).optional();
const optionalWebhookSecret = optionalSecret.refine(
  (value) => !value || value.length >= VALIDATION_LIMITS.WEBHOOK_SECRET_MIN_LENGTH,
  "Webhook secret must contain at least 32 characters",
);
const httpsUrl = z.string().url().max(VALIDATION_LIMITS.URL_LENGTH).refine((value) => value.startsWith("https://"), "HTTPS URL required");
const identifier = z.string().trim().min(1).max(VALIDATION_LIMITS.IDENTIFIER_LENGTH).regex(/^[A-Za-z][A-Za-z0-9_-]*$/);
const environmentKey = z.string().trim().min(1).max(VALIDATION_LIMITS.KEY_LENGTH).regex(/^[A-Za-z_][A-Za-z0-9_]*$/);
const cypressConfigKey = z.string().trim().min(1).max(VALIDATION_LIMITS.KEY_LENGTH).regex(/^[a-z][A-Za-z0-9]*$/);
const blockedCypressConfigKeys = new Set([
  "baseurl", "env", "specpattern", "supportfile", "fixturesfolder", "downloadsfolder",
  "screenshotsfolder", "videosfolder", "fileserverfolder", "setupnodeevents", "projectid",
]);
const reservedReportPortalParameters = new Set(["filter.eq.launchid", "filter.eq.hasstats", "filter.in.status"]);
const primitiveValue = z.union([
  z.string().max(500).refine((value) => !/[\r\n]/.test(value), "Line breaks are not allowed"),
  z.number().finite(),
  z.boolean(),
]);

const githubRepositoryPart = z.string().trim().min(1).max(VALIDATION_LIMITS.IDENTIFIER_LENGTH)
  .regex(/^[A-Za-z0-9_.-]+$/);
const githubRef = z.string().trim().min(1).max(VALIDATION_LIMITS.FIELD_VALUE_LENGTH)
  .regex(/^[A-Za-z0-9_./-]+$/);
const githubWorkflow = z.string().trim().min(1).max(VALIDATION_LIMITS.FIELD_VALUE_LENGTH)
  .regex(/^[A-Za-z0-9_.-]+\.ya?ml$/);

export const githubIntegrationSchema = z.object({
  token: optionalSecret,
  webhookSecret: optionalWebhookSecret,
  actions: z.object({
    owner: githubRepositoryPart,
    repository: githubRepositoryPart,
    workflow: githubWorkflow,
    ref: githubRef,
  }).strict(),
  source: z.object({
    owner: githubRepositoryPart,
    repository: githubRepositoryPart,
    ref: githubRef,
  }).strict(),
}).strict();

export const reportFieldMappingSchema = z.object({
  key: identifier,
  label: z.string().trim().min(1).max(VALIDATION_LIMITS.LABEL_LENGTH),
  reportPortalParameter: z.string().trim().regex(/^filter\.(?:eq|cnt|in)\.[A-Za-z][A-Za-z0-9.]*$/),
  type: z.enum(["text", "enum"]).default("text"),
  options: z.array(z.string().trim().min(1).max(VALIDATION_LIMITS.FIELD_VALUE_LENGTH)).max(VALIDATION_LIMITS.FIELD_OPTIONS).default([]),
  defaultValue: z.string().trim().max(VALIDATION_LIMITS.FIELD_VALUE_LENGTH).default(""),
  required: z.boolean().default(false),
}).strict().superRefine((field, context) => {
  if (reservedReportPortalParameters.has(field.reportPortalParameter.toLowerCase())) {
    context.addIssue({ code: "custom", path: ["reportPortalParameter"], message: "This ReportPortal parameter is controlled by the dashboard" });
  }
  if (field.type === "text" && field.options.length) {
    context.addIssue({ code: "custom", path: ["options"], message: "Text fields cannot define options" });
  }
  if (field.type === "enum") {
    if (!field.options.length) context.addIssue({ code: "custom", path: ["options"], message: "Enum fields require at least one option" });
    if (new Set(field.options.map((option) => option.toLowerCase())).size !== field.options.length) {
      context.addIssue({ code: "custom", path: ["options"], message: "Enum options must be unique" });
    }
    if (field.defaultValue && !field.options.includes(field.defaultValue)) {
      context.addIssue({ code: "custom", path: ["defaultValue"], message: "Default value must be one of the enum options" });
    }
  }
});

export const cypressConfigFieldSchema = z.object({
  key: cypressConfigKey,
  label: z.string().trim().min(1).max(VALIDATION_LIMITS.LABEL_LENGTH),
  type: z.enum(["string", "number", "boolean"]),
  minimum: z.number().finite().optional(),
  maximum: z.number().finite().optional(),
}).strict().superRefine((field, context) => {
  if (blockedCypressConfigKeys.has(field.key.toLowerCase())) {
    context.addIssue({ code: "custom", path: ["key"], message: "This Cypress configuration key cannot be overridden" });
  }
  if (field.type !== "number" && (field.minimum !== undefined || field.maximum !== undefined)) {
    context.addIssue({ code: "custom", message: "Only number fields can have minimum or maximum values" });
  }
  if (field.minimum !== undefined && field.maximum !== undefined && field.minimum > field.maximum) {
    context.addIssue({ code: "custom", message: "Minimum cannot exceed maximum" });
  }
});

export const launchProfileMappingSchema = z.object({
  pattern: z.string().trim().min(1).max(VALIDATION_LIMITS.FIELD_VALUE_LENGTH),
  profileId: z.string().uuid(),
}).strict();

export const dashboardSettingsInputSchema = z.object({
  reportPortalApiUrl: httpsUrl,
  reportPortalApiKey: optionalSecret,
  testRailBaseUrl: httpsUrl.optional().or(z.literal("")),
  testRailApiUser: z.string().trim().max(VALIDATION_LIMITS.EMAIL_LENGTH).optional(),
  testRailApiKey: optionalSecret,
  github: githubIntegrationSchema.optional(),
  defaultProject: z.string().trim().min(1).max(VALIDATION_LIMITS.KEY_LENGTH),
  defaultLaunchName: z.string().trim().min(1).max(VALIDATION_LIMITS.FIELD_VALUE_LENGTH),
  defaultHistoryDepth: z.number().int().min(1).max(Math.max(...DISPLAY.HISTORY_DEPTH_OPTIONS)),
  reportFields: z.array(reportFieldMappingSchema).max(VALIDATION_LIMITS.REPORT_FIELDS).default([]),
  cypressConfigFields: z.array(cypressConfigFieldSchema).max(VALIDATION_LIMITS.CYPRESS_CONFIG_FIELDS).default([]),
  launchProfileMappings: z.array(launchProfileMappingSchema).max(VALIDATION_LIMITS.PROFILE_MAPPINGS).default([]),
}).strict().superRefine((settings, context) => {
  for (const [path, values] of [
    ["reportFields", settings.reportFields.map(({ key }) => key.toLowerCase())],
    ["cypressConfigFields", settings.cypressConfigFields.map(({ key }) => key.toLowerCase())],
    ["reportFields", settings.reportFields.map(({ reportPortalParameter }) => reportPortalParameter.toLowerCase())],
  ] as const) {
    if (new Set(values).size !== values.length) {
      context.addIssue({ code: "custom", path: [path], message: "Field keys must be unique" });
    }
  }
});

export const cypressProfileVariableSchema = z.object({
  key: environmentKey,
  type: z.enum(["string", "number", "boolean"]).default("string"),
  value: z.string().max(VALIDATION_LIMITS.API_SECRET_LENGTH).refine((value) => !/[\r\n]/.test(value), "Line breaks are not allowed").optional(),
  secret: z.boolean().default(false),
}).strict();

export const cypressProfileInputSchema = z.object({
  name: z.string().trim().min(1).max(VALIDATION_LIMITS.IDENTIFIER_LENGTH).regex(/^[A-Za-z0-9_. -]+$/),
  baseUrl: httpsUrl,
  variables: z.array(cypressProfileVariableSchema).max(VALIDATION_LIMITS.PROFILE_VARIABLES).default([]),
  isDefault: z.boolean().default(false),
}).strict().superRefine((profile, context) => {
  const keys = profile.variables.map(({ key }) => key.toLowerCase());
  if (new Set(keys).size !== keys.length) {
    context.addIssue({ code: "custom", path: ["variables"], message: "Environment variable keys must be unique" });
  }
  profile.variables.forEach((variable, index) => {
    if (variable.secret && variable.type !== "string") {
      context.addIssue({ code: "custom", path: ["variables", index, "type"], message: "Secret variables must be strings" });
    }
  });
});

export const customCypressConfigSchema = z.record(cypressConfigKey, primitiveValue)
  .refine((value) => Object.keys(value).every((key) => !blockedCypressConfigKeys.has(key.toLowerCase())), "Unsupported Cypress configuration key")
  .refine((value) => Object.keys(value).length <= VALIDATION_LIMITS.CYPRESS_CONFIG_FIELDS, "Too many Cypress configuration values");

export type DashboardSettingsInput = z.infer<typeof dashboardSettingsInputSchema>;
export type GitHubIntegrationInput = z.infer<typeof githubIntegrationSchema>;
export type ReportFieldMapping = z.infer<typeof reportFieldMappingSchema>;
export type CypressConfigField = z.infer<typeof cypressConfigFieldSchema>;
export type LaunchProfileMapping = z.infer<typeof launchProfileMappingSchema>;
export type CypressProfileInput = z.infer<typeof cypressProfileInputSchema>;
export type CypressProfileVariableInput = z.infer<typeof cypressProfileVariableSchema>;

export interface DashboardSettingsView extends Omit<DashboardSettingsInput, "reportPortalApiKey" | "testRailApiKey" | "github"> {
  configured: boolean;
  hasReportPortalApiKey: boolean;
  hasTestRailApiKey: boolean;
  github?: Omit<GitHubIntegrationInput, "token" | "webhookSecret"> & {
    hasToken: boolean;
    hasWebhookSecret: boolean;
  };
}

export interface CypressProfileVariableView extends Omit<CypressProfileVariableInput, "value"> {
  value: string;
  hasValue: boolean;
}

export interface CypressProfileView extends Omit<CypressProfileInput, "variables"> {
  id: string;
  variables: CypressProfileVariableView[];
}

export interface CypressProfileSecret {
  baseUrl: string;
  env: Record<string, string | number | boolean>;
  secretKeys: string[];
}

export interface RunProfileSnapshot {
  name: string;
  environment: CypressProfileSecret;
}
