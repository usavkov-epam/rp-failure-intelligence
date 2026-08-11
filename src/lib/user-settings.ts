import "server-only";

import { createClient } from "@supabase/supabase-js";

import { config } from "./config";
import { defaultCypressConfigFields, legacyReportFields } from "./configuration-mappings";
import { readLocalStore, updateLocalStore, type LocalProfileRecord } from "./local-store";
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
  reportFields?: DashboardSettingsInput["reportFields"];
  cypressConfigFields?: DashboardSettingsInput["cypressConfigFields"];
  launchProfileMappings?: DashboardSettingsInput["launchProfileMappings"];
}

interface StoredCypressProfile extends Omit<CypressProfileSecret, "secretKeys"> {
  secretKeys?: string[];
  password?: string;
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
  const storedReportFields = secrets.reportFields || legacyReportFields.map((field) => ({
    ...field,
    defaultValue: row.default_team,
  }));
  const reportFields = storedReportFields.map((field) => ({
    ...field,
    type: field.type || "text" as const,
    options: field.options || [],
  }));
  return {
    configured: true,
    reportPortalApiUrl: row.reportportal_api_url,
    testRailBaseUrl: row.testrail_base_url || "",
    testRailApiUser: secrets.testRailApiUser || "",
    defaultProject: row.default_project,
    defaultLaunchName: row.default_launch_name,
    defaultHistoryDepth: row.default_history_depth,
    reportFields,
    cypressConfigFields: secrets.cypressConfigFields || defaultCypressConfigFields,
    launchProfileMappings: secrets.launchProfileMappings || [],
    hasReportPortalApiKey: Boolean(secrets.reportPortalApiKey),
    hasTestRailApiKey: Boolean(secrets.testRailApiKey),
  };
}

function localDashboardView(input: DashboardSettingsInput): DashboardSettingsView {
  return dashboardView({
    owner_key: "local:developer",
    reportportal_api_url: input.reportPortalApiUrl,
    testrail_base_url: input.testRailBaseUrl || null,
    default_project: input.defaultProject,
    default_launch_name: input.defaultLaunchName,
    default_team: input.reportFields[0]?.defaultValue || "",
    default_history_depth: input.defaultHistoryDepth,
    secret_id: "local",
  }, {
    reportPortalApiKey: input.reportPortalApiKey || "",
    testRailApiUser: input.testRailApiUser,
    testRailApiKey: input.testRailApiKey,
    reportFields: input.reportFields,
    cypressConfigFields: input.cypressConfigFields,
    launchProfileMappings: input.launchProfileMappings,
  });
}

export async function getDashboardSettings(ownerKey: string) {
  if (config.isLocal) {
    const dashboard = (await readLocalStore()).dashboard;
    return dashboard?.ownerKey === ownerKey ? localDashboardView(dashboard.settings) : null;
  }
  const { data, error } = await getClient().from("user_dashboard_settings").select("*").eq("owner_key", ownerKey).maybeSingle();
  if (error) throw new Error(`Unable to load dashboard settings: ${error.message}`);
  if (!data) return null;
  const row = data as DashboardRow;
  return dashboardView(row, await readSecret<DashboardSecrets>(row.secret_id));
}

export async function getDashboardConnection(ownerKey: string) {
  if (config.isLocal) {
    const dashboard = (await readLocalStore()).dashboard;
    if (!dashboard || dashboard.ownerKey !== ownerKey) return null;
    return {
      settings: localDashboardView(dashboard.settings),
      reportPortal: { apiUrl: dashboard.settings.reportPortalApiUrl.replace(/\/$/, ""), apiKey: dashboard.settings.reportPortalApiKey || "" },
      testRailBaseUrl: dashboard.settings.testRailBaseUrl?.replace(/\/$/, ""),
    };
  }
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
  if (config.isLocal) {
    const settings = await updateLocalStore((store) => {
      const previous = store.dashboard?.ownerKey === ownerKey ? store.dashboard.settings : undefined;
      const merged: DashboardSettingsInput = {
        ...input,
        reportPortalApiUrl: input.reportPortalApiUrl.replace(/\/$/, ""),
        testRailBaseUrl: input.testRailBaseUrl?.replace(/\/$/, "") || "",
        reportPortalApiKey: input.reportPortalApiKey || previous?.reportPortalApiKey || "",
        testRailApiKey: input.testRailApiKey || previous?.testRailApiKey,
        testRailApiUser: input.testRailApiUser || previous?.testRailApiUser,
      };
      if (!merged.reportPortalApiKey) throw new Error("ReportPortal API key is required");
      store.dashboard = { ownerKey, settings: merged };
      return merged;
    });
    return localDashboardView(settings);
  }
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
    reportFields: input.reportFields,
    cypressConfigFields: input.cypressConfigFields,
    launchProfileMappings: input.launchProfileMappings,
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
    default_team: input.reportFields[0]?.defaultValue || "",
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

function storedSecretKeys(stored: StoredCypressProfile) {
  if (stored.secretKeys) return stored.secretKeys;
  return ["diku_password", "EDGE_API_KEY"].filter((key) => stored.env[key] !== undefined);
}

function parseVariableValue(type: "string" | "number" | "boolean", value: string) {
  if (type === "string") return value;
  if (type === "boolean") {
    if (value !== "true" && value !== "false") throw new Error("Boolean environment values must be true or false");
    return value === "true";
  }
  if (!value.trim()) throw new Error("Number environment values cannot be blank");
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error("Number environment values must be finite numbers");
  return parsed;
}

function toStoredProfile(input: CypressProfileInput, previous?: StoredCypressProfile): StoredCypressProfile {
  const previousSecrets = new Set(previous ? storedSecretKeys(previous) : []);
  const env: Record<string, string | number | boolean> = {};
  const secretKeys: string[] = [];
  for (const variable of input.variables) {
    const submitted = variable.value || "";
    if (variable.secret) {
      secretKeys.push(variable.key);
      if (!submitted) {
        const previousValue = previousSecrets.has(variable.key) ? previous?.env[variable.key] : undefined;
        if (previousValue === undefined) throw new Error(`Secret environment variable ${variable.key} requires a value`);
        env[variable.key] = previousValue;
        continue;
      }
    }
    env[variable.key] = parseVariableValue(variable.type, submitted);
  }
  return { baseUrl: input.baseUrl, env, secretKeys };
}

function profileView(row: CypressProfileRow, stored: StoredCypressProfile): CypressProfileView {
  const secretKeys = new Set(storedSecretKeys(stored));
  return {
    id: row.id,
    name: row.name,
    isDefault: row.is_default,
    baseUrl: stored.baseUrl,
    variables: Object.entries(stored.env).map(([key, value]) => ({
      key,
      type: typeof value as "string" | "number" | "boolean",
      value: secretKeys.has(key) ? "" : String(value),
      secret: secretKeys.has(key),
      hasValue: value !== "",
    })),
  };
}

export async function listCypressProfiles(ownerKey: string) {
  if (config.isLocal) {
    return (await readLocalStore()).profiles.filter((profile) => profile.ownerKey === ownerKey)
      .sort((left, right) => Number(right.isDefault) - Number(left.isDefault) || left.name.localeCompare(right.name))
      .map((profile) => profileView({ id: profile.id, owner_key: profile.ownerKey, name: profile.name, is_default: profile.isDefault, secret_id: "local" }, profile.environment));
  }
  const { data, error } = await getClient().from("cypress_profiles").select("*").eq("owner_key", ownerKey)
    .order("is_default", { ascending: false }).order("name");
  if (error) throw new Error(`Unable to load Cypress profiles: ${error.message}`);
  return Promise.all((data as CypressProfileRow[]).map(async (row) => profileView(row, await readSecret<StoredCypressProfile>(row.secret_id))));
}

export async function getCypressProfileSecret(ownerKey: string, profileId: string) {
  if (config.isLocal) {
    const stored = (await readLocalStore()).profiles.find((profile) => profile.ownerKey === ownerKey && profile.id === profileId);
    if (!stored) return null;
    const row: CypressProfileRow = { id: stored.id, owner_key: stored.ownerKey, name: stored.name, is_default: stored.isDefault, secret_id: "local" };
    return { row, profile: profileView(row, stored.environment), environment: stored.environment };
  }
  const { data, error } = await getClient().from("cypress_profiles").select("*")
    .eq("owner_key", ownerKey).eq("id", profileId).maybeSingle();
  if (error) throw new Error(`Unable to load Cypress profile: ${error.message}`);
  if (!data) return null;
  const row = data as CypressProfileRow;
  const stored = await readSecret<StoredCypressProfile>(row.secret_id);
  return {
    row,
    profile: profileView(row, stored),
    environment: { baseUrl: stored.baseUrl, env: stored.env, secretKeys: storedSecretKeys(stored) } as CypressProfileSecret,
  };
}

export async function saveCypressProfile(ownerKey: string, input: CypressProfileInput, profileId?: string) {
  if (config.isLocal) {
    return updateLocalStore((store) => {
      const existingIndex = profileId ? store.profiles.findIndex((item) => item.ownerKey === ownerKey && item.id === profileId) : -1;
      if (profileId && existingIndex < 0) throw new Error("Cypress profile was not found");
      const existing = existingIndex >= 0 ? store.profiles[existingIndex] : undefined;
      const environment = toStoredProfile(input, existing?.environment);
      if (input.isDefault) store.profiles.forEach((item) => { if (item.ownerKey === ownerKey) item.isDefault = false; });
      const stored: LocalProfileRecord = {
        id: existing?.id || crypto.randomUUID(),
        ownerKey,
        name: input.name,
        isDefault: input.isDefault,
        environment: { baseUrl: environment.baseUrl, env: environment.env, secretKeys: storedSecretKeys(environment) },
      };
      if (existingIndex >= 0) store.profiles[existingIndex] = stored;
      else store.profiles.push(stored);
      return profileView({ id: stored.id, owner_key: ownerKey, name: stored.name, is_default: stored.isDefault, secret_id: "local" }, stored.environment);
    });
  }
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
  if (config.isLocal) {
    return updateLocalStore((store) => {
      const index = store.profiles.findIndex((profile) => profile.ownerKey === ownerKey && profile.id === profileId);
      if (index < 0) return false;
      store.profiles.splice(index, 1);
      return true;
    });
  }
  const client = getClient();
  const { data, error } = await client.from("cypress_profiles").delete().eq("owner_key", ownerKey).eq("id", profileId).select("secret_id").maybeSingle();
  if (error) throw new Error(`Unable to delete Cypress profile: ${error.message}`);
  if (!data) return false;
  await deleteSecret(data.secret_id as string);
  return true;
}

export async function createRunProfileSnapshot(requestId: string, snapshot: RunProfileSnapshot) {
  if (config.isLocal) {
    await updateLocalStore((store) => {
      const now = Date.now();
      for (const [id, stored] of Object.entries(store.snapshots)) if (Date.parse(stored.expiresAt) <= now) delete store.snapshots[id];
      store.snapshots[requestId] = { value: snapshot, expiresAt: new Date(now + 60 * 60 * 1000).toISOString() };
    });
    return;
  }
  const { error: purgeError } = await getClient().rpc("purge_expired_cypress_run_profiles");
  if (purgeError) throw new Error(`Unable to purge expired Cypress profiles: ${purgeError.message}`);
  const secretId = await createSecret(snapshot, `run:${requestId}`, "Short-lived Cypress run profile");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const { error } = await getClient().from("cypress_run_profiles").insert({ request_id: requestId, secret_id: secretId, expires_at: expiresAt });
  if (error) {
    await deleteSecret(secretId).catch(() => undefined);
    throw new Error(`Unable to prepare Cypress run profile: ${error.message}`);
  }
}

export async function consumeRunProfileSnapshot(requestId: string) {
  if (config.isLocal) {
    return updateLocalStore((store) => {
      const stored = store.snapshots[requestId];
      delete store.snapshots[requestId];
      return stored && Date.parse(stored.expiresAt) > Date.now() ? stored.value : null;
    });
  }
  const { data, error } = await getClient().rpc("consume_cypress_run_profile", { run_request_id: requestId });
  if (error) throw new Error(`Unable to load Cypress run profile: ${error.message}`);
  return typeof data === "string" ? JSON.parse(data) as RunProfileSnapshot : null;
}
