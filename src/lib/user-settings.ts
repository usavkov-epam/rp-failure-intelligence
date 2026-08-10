import "server-only";

import { createClient } from "@supabase/supabase-js";

import { config } from "./config";
import type {
  CypressProfileInput,
  CypressProfileSecret,
  CypressProfileView,
  DashboardSettingsInput,
  DashboardSettingsView,
  RunProfileSnapshot,
} from "./user-settings-schema";

interface DashboardRow {
  owner_key: string;
  reportportal_api_url: string;
  testrail_base_url: string | null;
  default_project: string;
  default_launch_name: string;
  default_team: string;
  default_history_depth: number;
  secret_id: string;
}

interface CypressProfileRow {
  id: string;
  owner_key: string;
  name: string;
  is_default: boolean;
  secret_id: string;
}

interface DashboardSecrets {
  reportPortalApiKey: string;
  testRailApiUser?: string;
  testRailApiKey?: string;
}

interface StoredCypressProfile extends CypressProfileSecret {
  password: string;
  edgeApiKey?: string;
}

function getClient() {
  const { url, serviceRoleKey } = config.supabase;
  if (!url || !serviceRoleKey) throw new Error("Supabase user configuration is not configured");
  return createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function createSecret(value: unknown, name: string, description: string) {
  const { data, error } = await getClient().rpc("app_secret_create", {
    secret_value: JSON.stringify(value),
    secret_name: name,
    secret_description: description,
  });
  if (error || typeof data !== "string") throw new Error(`Unable to store encrypted configuration: ${error?.message || "invalid Vault response"}`);
  return data;
}

async function updateSecret(id: string, value: unknown) {
  const { error } = await getClient().rpc("app_secret_update", {
    secret_identifier: id,
    secret_value: JSON.stringify(value),
  });
  if (error) throw new Error(`Unable to update encrypted configuration: ${error.message}`);
}

async function readSecret<T>(id: string): Promise<T> {
  const { data, error } = await getClient().rpc("app_secret_read", { secret_identifier: id });
  if (error || typeof data !== "string") throw new Error(`Unable to read encrypted configuration: ${error?.message || "secret unavailable"}`);
  return JSON.parse(data) as T;
}

async function deleteSecret(id: string) {
  const { error } = await getClient().rpc("app_secret_delete", { secret_identifier: id });
  if (error) throw new Error(`Unable to delete encrypted configuration: ${error.message}`);
}

function dashboardView(row: DashboardRow, secrets: DashboardSecrets): DashboardSettingsView {
  return {
    configured: true,
    reportPortalApiUrl: row.reportportal_api_url,
    testRailBaseUrl: row.testrail_base_url || "",
    testRailApiUser: secrets.testRailApiUser || "",
    defaultProject: row.default_project,
    defaultLaunchName: row.default_launch_name,
    defaultTeam: row.default_team,
    defaultHistoryDepth: row.default_history_depth,
    hasReportPortalApiKey: Boolean(secrets.reportPortalApiKey),
    hasTestRailApiKey: Boolean(secrets.testRailApiKey),
  };
}

export async function getDashboardSettings(ownerKey: string) {
  const { data, error } = await getClient().from("user_dashboard_settings").select("*").eq("owner_key", ownerKey).maybeSingle();
  if (error) throw new Error(`Unable to load dashboard settings: ${error.message}`);
  if (!data) return null;
  const row = data as DashboardRow;
  return dashboardView(row, await readSecret<DashboardSecrets>(row.secret_id));
}

export async function getDashboardConnection(ownerKey: string) {
  const { data, error } = await getClient().from("user_dashboard_settings").select("*").eq("owner_key", ownerKey).maybeSingle();
  if (error) throw new Error(`Unable to load dashboard settings: ${error.message}`);
  if (!data) return null;
  const row = data as DashboardRow;
  const secrets = await readSecret<DashboardSecrets>(row.secret_id);
  return {
    settings: dashboardView(row, secrets),
    reportPortal: { apiUrl: row.reportportal_api_url.replace(/\/$/, ""), apiKey: secrets.reportPortalApiKey },
    testRailBaseUrl: row.testrail_base_url?.replace(/\/$/, ""),
  };
}

export async function saveDashboardSettings(ownerKey: string, input: DashboardSettingsInput) {
  const client = getClient();
  const { data: existingData, error: existingError } = await client.from("user_dashboard_settings")
    .select("*").eq("owner_key", ownerKey).maybeSingle();
  if (existingError) throw new Error(`Unable to load dashboard settings: ${existingError.message}`);
  const existing = existingData as DashboardRow | null;
  const previous = existing ? await readSecret<DashboardSecrets>(existing.secret_id) : undefined;
  const secrets: DashboardSecrets = {
    reportPortalApiKey: input.reportPortalApiKey || previous?.reportPortalApiKey || "",
    testRailApiUser: input.testRailApiUser || previous?.testRailApiUser,
    testRailApiKey: input.testRailApiKey || previous?.testRailApiKey,
  };
  if (!secrets.reportPortalApiKey) throw new Error("ReportPortal API key is required");

  const secretId = existing?.secret_id || await createSecret(secrets, `dashboard:${ownerKey}`, "User dashboard integration credentials");
  if (existing) await updateSecret(secretId, secrets);
  const { error } = await client.from("user_dashboard_settings").upsert({
    owner_key: ownerKey,
    reportportal_api_url: input.reportPortalApiUrl.replace(/\/$/, ""),
    testrail_base_url: input.testRailBaseUrl?.replace(/\/$/, "") || null,
    default_project: input.defaultProject,
    default_launch_name: input.defaultLaunchName,
    default_team: input.defaultTeam,
    default_history_depth: input.defaultHistoryDepth,
    secret_id: secretId,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    if (!existing) await deleteSecret(secretId).catch(() => undefined);
    throw new Error(`Unable to save dashboard settings: ${error.message}`);
  }
  return getDashboardSettings(ownerKey);
}

function toStoredProfile(input: CypressProfileInput, previous?: StoredCypressProfile): StoredCypressProfile {
  const password = input.password || previous?.password || "";
  if (!password) throw new Error("Cypress profile password is required");
  const env: Record<string, string | boolean> = {
    OKAPI_HOST: input.okapiHost,
    OKAPI_TENANT: input.tenant,
    diku_login: input.login,
    diku_password: password,
    rtrAuth: input.rtrAuth,
    ecsEnabled: input.ecsEnabled,
    eureka: input.eureka,
  };
  if (input.edgeHost) env.EDGE_HOST = input.edgeHost;
  const edgeApiKey = input.edgeApiKey || previous?.edgeApiKey;
  if (edgeApiKey) env.EDGE_API_KEY = edgeApiKey;
  if (input.systemRoleName) env.systemRoleName = input.systemRoleName;
  if (input.ecsEnvironment) env.ecs_env_name = input.ecsEnvironment;
  return { baseUrl: input.baseUrl, env, password, edgeApiKey };
}

function profileView(row: CypressProfileRow, stored: StoredCypressProfile): CypressProfileView {
  return {
    id: row.id,
    name: row.name,
    isDefault: row.is_default,
    baseUrl: stored.baseUrl,
    okapiHost: String(stored.env.OKAPI_HOST || ""),
    tenant: String(stored.env.OKAPI_TENANT || ""),
    login: String(stored.env.diku_login || ""),
    edgeHost: String(stored.env.EDGE_HOST || ""),
    rtrAuth: stored.env.rtrAuth === true,
    ecsEnabled: stored.env.ecsEnabled === true,
    eureka: stored.env.eureka !== false,
    systemRoleName: stored.env.systemRoleName ? String(stored.env.systemRoleName) : undefined,
    ecsEnvironment: stored.env.ecs_env_name === "snapshot" || stored.env.ecs_env_name === "sprint" ? stored.env.ecs_env_name : undefined,
    hasPassword: Boolean(stored.password),
    hasEdgeApiKey: Boolean(stored.edgeApiKey),
  };
}

export async function listCypressProfiles(ownerKey: string) {
  const { data, error } = await getClient().from("cypress_profiles").select("*").eq("owner_key", ownerKey)
    .order("is_default", { ascending: false }).order("name");
  if (error) throw new Error(`Unable to load Cypress profiles: ${error.message}`);
  return Promise.all((data as CypressProfileRow[]).map(async (row) => profileView(row, await readSecret<StoredCypressProfile>(row.secret_id))));
}

export async function getCypressProfileSecret(ownerKey: string, profileId: string) {
  const { data, error } = await getClient().from("cypress_profiles").select("*")
    .eq("owner_key", ownerKey).eq("id", profileId).maybeSingle();
  if (error) throw new Error(`Unable to load Cypress profile: ${error.message}`);
  if (!data) return null;
  const row = data as CypressProfileRow;
  const stored = await readSecret<StoredCypressProfile>(row.secret_id);
  return { row, profile: profileView(row, stored), environment: { baseUrl: stored.baseUrl, env: stored.env } as CypressProfileSecret };
}

export async function saveCypressProfile(ownerKey: string, input: CypressProfileInput, profileId?: string) {
  const client = getClient();
  const existingResult = profileId
    ? await client.from("cypress_profiles").select("*").eq("owner_key", ownerKey).eq("id", profileId).maybeSingle()
    : { data: null, error: null };
  if (existingResult.error) throw new Error(`Unable to load Cypress profile: ${existingResult.error.message}`);
  const existing = existingResult.data as CypressProfileRow | null;
  if (profileId && !existing) throw new Error("Cypress profile was not found");
  const previous = existing ? await readSecret<StoredCypressProfile>(existing.secret_id) : undefined;
  const stored = toStoredProfile(input, previous);
  const secretId = existing?.secret_id || await createSecret(stored, `cypress:${ownerKey}:${crypto.randomUUID()}`, "User Cypress environment profile");
  if (existing) await updateSecret(secretId, stored);
  if (input.isDefault) await client.from("cypress_profiles").update({ is_default: false }).eq("owner_key", ownerKey);
  const payload = { owner_key: ownerKey, name: input.name, is_default: input.isDefault, secret_id: secretId, updated_at: new Date().toISOString() };
  const result = existing
    ? await client.from("cypress_profiles").update(payload).eq("owner_key", ownerKey).eq("id", existing.id).select().single()
    : await client.from("cypress_profiles").insert(payload).select().single();
  if (result.error) {
    if (!existing) await deleteSecret(secretId).catch(() => undefined);
    throw new Error(`Unable to save Cypress profile: ${result.error.message}`);
  }
  const row = result.data as CypressProfileRow;
  return profileView(row, stored);
}

export async function removeCypressProfile(ownerKey: string, profileId: string) {
  const client = getClient();
  const { data, error } = await client.from("cypress_profiles").delete().eq("owner_key", ownerKey).eq("id", profileId).select("secret_id").maybeSingle();
  if (error) throw new Error(`Unable to delete Cypress profile: ${error.message}`);
  if (!data) return false;
  await deleteSecret(data.secret_id as string);
  return true;
}

export async function createRunProfileSnapshot(requestId: string, snapshot: RunProfileSnapshot) {
  const secretId = await createSecret(snapshot, `run:${requestId}`, "Short-lived Cypress run profile");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const { error } = await getClient().from("cypress_run_profiles").insert({ request_id: requestId, secret_id: secretId, expires_at: expiresAt });
  if (error) {
    await deleteSecret(secretId).catch(() => undefined);
    throw new Error(`Unable to prepare Cypress run profile: ${error.message}`);
  }
}

export async function consumeRunProfileSnapshot(requestId: string) {
  const client = getClient();
  const { data, error } = await client.rpc("claim_cypress_run_profile", { run_request_id: requestId });
  if (error) throw new Error(`Unable to load Cypress run profile: ${error.message}`);
  if (!data) return null;
  const secretId = String(data);
  const snapshot = await readSecret<RunProfileSnapshot>(secretId);
  await deleteSecret(secretId);
  return snapshot;
}
