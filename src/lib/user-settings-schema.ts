import { z } from "zod";

const optionalSecret = z.string().max(4_096).optional();
const httpsUrl = z.string().url().max(500).refine((value) => value.startsWith("https://"), "HTTPS URL required");
const identifier = z.string().trim().min(1).max(80).regex(/^[A-Za-z][A-Za-z0-9_-]*$/);
const environmentKey = z.string().trim().min(1).max(100).regex(/^[A-Za-z_][A-Za-z0-9_]*$/);
const cypressConfigKey = z.string().trim().min(1).max(100).regex(/^[a-z][A-Za-z0-9]*$/);
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

export const reportFieldMappingSchema = z.object({
  key: identifier,
  label: z.string().trim().min(1).max(100),
  reportPortalParameter: z.string().trim().regex(/^filter\.(?:eq|cnt|in)\.[A-Za-z][A-Za-z0-9.]*$/),
  defaultValue: z.string().trim().max(200).default(""),
  required: z.boolean().default(false),
}).strict().superRefine((field, context) => {
  if (reservedReportPortalParameters.has(field.reportPortalParameter.toLowerCase())) {
    context.addIssue({ code: "custom", path: ["reportPortalParameter"], message: "This ReportPortal parameter is controlled by the dashboard" });
  }
});

export const cypressConfigFieldSchema = z.object({
  key: cypressConfigKey,
  label: z.string().trim().min(1).max(100),
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
  pattern: z.string().trim().min(1).max(200),
  profileId: z.string().uuid(),
}).strict();

export const dashboardSettingsInputSchema = z.object({
  reportPortalApiUrl: httpsUrl,
  reportPortalApiKey: optionalSecret,
  testRailBaseUrl: httpsUrl.optional().or(z.literal("")),
  testRailApiUser: z.string().trim().max(320).optional(),
  testRailApiKey: optionalSecret,
  defaultProject: z.string().trim().min(1).max(100),
  defaultLaunchName: z.string().trim().min(1).max(200),
  defaultHistoryDepth: z.number().int().min(1).max(30),
  reportFields: z.array(reportFieldMappingSchema).max(12).default([]),
  cypressConfigFields: z.array(cypressConfigFieldSchema).max(30).default([]),
  launchProfileMappings: z.array(launchProfileMappingSchema).max(50).default([]),
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
  value: z.string().max(4_096).refine((value) => !/[\r\n]/.test(value), "Line breaks are not allowed").optional(),
  secret: z.boolean().default(false),
}).strict();

export const cypressProfileInputSchema = z.object({
  name: z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9_. -]+$/),
  baseUrl: httpsUrl,
  variables: z.array(cypressProfileVariableSchema).max(50).default([]),
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
  .refine((value) => Object.keys(value).length <= 30, "Too many Cypress configuration values");

export type DashboardSettingsInput = z.infer<typeof dashboardSettingsInputSchema>;
export type ReportFieldMapping = z.infer<typeof reportFieldMappingSchema>;
export type CypressConfigField = z.infer<typeof cypressConfigFieldSchema>;
export type LaunchProfileMapping = z.infer<typeof launchProfileMappingSchema>;
export type CypressProfileInput = z.infer<typeof cypressProfileInputSchema>;
export type CypressProfileVariableInput = z.infer<typeof cypressProfileVariableSchema>;

export interface DashboardSettingsView extends Omit<DashboardSettingsInput, "reportPortalApiKey" | "testRailApiKey"> {
  configured: boolean;
  hasReportPortalApiKey: boolean;
  hasTestRailApiKey: boolean;
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
