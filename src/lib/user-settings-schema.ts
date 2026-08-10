import { z } from "zod";

const optionalSecret = z.string().max(4_096).optional();
const httpsUrl = z.string().url().max(500).refine((value) => value.startsWith("https://"), "HTTPS URL required");

export const dashboardSettingsInputSchema = z.object({
  reportPortalApiUrl: httpsUrl,
  reportPortalApiKey: optionalSecret,
  testRailBaseUrl: httpsUrl.optional().or(z.literal("")),
  testRailApiUser: z.string().trim().max(320).optional(),
  testRailApiKey: optionalSecret,
  defaultProject: z.string().trim().min(1).max(100),
  defaultLaunchName: z.string().trim().min(1).max(200),
  defaultTeam: z.string().trim().min(1).max(100),
  defaultHistoryDepth: z.number().int().min(1).max(30),
}).strict();

export const cypressProfileInputSchema = z.object({
  name: z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9_. -]+$/),
  baseUrl: httpsUrl,
  okapiHost: httpsUrl,
  tenant: z.string().trim().min(1).max(100),
  login: z.string().trim().min(1).max(200),
  password: optionalSecret,
  edgeHost: httpsUrl.optional().or(z.literal("")),
  edgeApiKey: optionalSecret,
  rtrAuth: z.boolean().default(false),
  ecsEnabled: z.boolean().default(false),
  eureka: z.boolean().default(true),
  systemRoleName: z.string().trim().max(100).optional(),
  ecsEnvironment: z.enum(["snapshot", "sprint"]).optional(),
  isDefault: z.boolean().default(false),
}).strict();

export type DashboardSettingsInput = z.infer<typeof dashboardSettingsInputSchema>;
export type CypressProfileInput = z.infer<typeof cypressProfileInputSchema>;

export interface DashboardSettingsView extends Omit<DashboardSettingsInput, "reportPortalApiKey" | "testRailApiKey"> {
  configured: boolean;
  hasReportPortalApiKey: boolean;
  hasTestRailApiKey: boolean;
}

export interface CypressProfileView extends Omit<CypressProfileInput, "password" | "edgeApiKey"> {
  id: string;
  hasPassword: boolean;
  hasEdgeApiKey: boolean;
}

export interface CypressProfileSecret {
  baseUrl: string;
  env: Record<string, string | boolean>;
}

export interface RunProfileSnapshot {
  name: string;
  environment: CypressProfileSecret;
}
