import "server-only";

import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";

import { config } from "./config";
import { defaultCypressConfigFields, legacyReportFields } from "./configuration-mappings";
import { getDynamoClient, getDynamoTableName } from "./dynamodb";
import { ownerPartitionKey, profileSortKey, snapshotKey } from "./dynamodb-keys";
import { DYNAMO_ENTITY, DYNAMO_KEY, TIME } from "./domain-constants";
import { readLocalStore, updateLocalStore, type LocalProfileRecord } from "./local-store";
import { decryptValue, encryptValue, type EncryptedValue } from "./secure-value";
import type {
  CypressProfileInput,
  CypressProfileSecret,
  CypressProfileView,
  DashboardSettingsInput,
  DashboardSettingsView,
  RunProfileSnapshot,
} from "./user-settings-schema";

interface DashboardItem {
  pk: string;
  sk: typeof DYNAMO_KEY.SETTINGS;
  entity: typeof DYNAMO_ENTITY.DASHBOARD_SETTINGS;
  encrypted: EncryptedValue;
  updatedAt: string;
}

interface CypressProfileItem {
  pk: string;
  sk: string;
  entity: typeof DYNAMO_ENTITY.CYPRESS_PROFILE;
  id: string;
  name: string;
  isDefault: boolean;
  encrypted: EncryptedValue;
  updatedAt: string;
}

interface StoredCypressProfile extends Omit<CypressProfileSecret, "secretKeys"> {
  secretKeys?: string[];
  password?: string;
  edgeApiKey?: string;
}

function dashboardContext(ownerKey: string) {
  return `dashboard:${ownerKey}`;
}

function profileContext(ownerKey: string, profileId: string) {
  return `profile:${ownerKey}:${profileId}`;
}

function dashboardView(input: DashboardSettingsInput): DashboardSettingsView {
  const storedReportFields = input.reportFields.length
    ? input.reportFields
    : legacyReportFields.map((field) => ({ ...field, defaultValue: "" }));
  return {
    configured: true,
    reportPortalApiUrl: input.reportPortalApiUrl,
    testRailBaseUrl: input.testRailBaseUrl || "",
    testRailApiUser: input.testRailApiUser || "",
    defaultProject: input.defaultProject,
    defaultLaunchName: input.defaultLaunchName,
    defaultHistoryDepth: input.defaultHistoryDepth,
    reportFields: storedReportFields.map((field) => ({
      ...field,
      type: field.type || "text" as const,
      options: field.options || [],
    })),
    cypressConfigFields: input.cypressConfigFields || defaultCypressConfigFields,
    launchProfileMappings: input.launchProfileMappings || [],
    hasReportPortalApiKey: Boolean(input.reportPortalApiKey),
    hasTestRailApiKey: Boolean(input.testRailApiKey),
  };
}

async function readHostedDashboard(ownerKey: string) {
  const result = await getDynamoClient().send(new GetCommand({
    TableName: getDynamoTableName(),
    Key: { pk: ownerPartitionKey(ownerKey), sk: DYNAMO_KEY.SETTINGS },
    ConsistentRead: true,
  }));
  const item = result.Item as DashboardItem | undefined;
  return item ? decryptValue<DashboardSettingsInput>(item.encrypted, dashboardContext(ownerKey)) : null;
}

export async function getDashboardSettings(ownerKey: string) {
  if (config.isLocal) {
    const dashboard = (await readLocalStore()).dashboard;
    return dashboard?.ownerKey === ownerKey ? dashboardView(dashboard.settings) : null;
  }
  const dashboard = await readHostedDashboard(ownerKey);
  return dashboard ? dashboardView(dashboard) : null;
}

export async function getDashboardConnection(ownerKey: string) {
  let stored: DashboardSettingsInput | null | undefined;
  if (config.isLocal) {
    const dashboard = (await readLocalStore()).dashboard;
    stored = dashboard?.ownerKey === ownerKey ? dashboard.settings : null;
  } else {
    stored = await readHostedDashboard(ownerKey);
  }
  if (!stored) return null;
  return {
    settings: dashboardView(stored),
    reportPortal: {
      apiUrl: stored.reportPortalApiUrl.replace(/\/$/, ""),
      apiKey: stored.reportPortalApiKey || "",
    },
    testRailBaseUrl: stored.testRailBaseUrl?.replace(/\/$/, ""),
  };
}

function mergeDashboardSettings(input: DashboardSettingsInput, previous?: DashboardSettingsInput): DashboardSettingsInput {
  const merged = {
    ...input,
    reportPortalApiUrl: input.reportPortalApiUrl.replace(/\/$/, ""),
    testRailBaseUrl: input.testRailBaseUrl?.replace(/\/$/, "") || "",
    reportPortalApiKey: input.reportPortalApiKey || previous?.reportPortalApiKey || "",
    testRailApiKey: input.testRailApiKey || previous?.testRailApiKey,
    testRailApiUser: input.testRailApiUser || previous?.testRailApiUser,
  };
  if (!merged.reportPortalApiKey) throw new Error("ReportPortal API key is required");
  return merged;
}

export async function saveDashboardSettings(ownerKey: string, input: DashboardSettingsInput) {
  if (config.isLocal) {
    const settings = await updateLocalStore((store) => {
      const previous = store.dashboard?.ownerKey === ownerKey ? store.dashboard.settings : undefined;
      const merged = mergeDashboardSettings(input, previous);
      store.dashboard = { ownerKey, settings: merged };
      return merged;
    });
    return dashboardView(settings);
  }

  const settings = mergeDashboardSettings(input, await readHostedDashboard(ownerKey) || undefined);
  const now = new Date().toISOString();
  const item: DashboardItem = {
    pk: ownerPartitionKey(ownerKey),
    sk: DYNAMO_KEY.SETTINGS,
    entity: DYNAMO_ENTITY.DASHBOARD_SETTINGS,
    encrypted: encryptValue(settings, dashboardContext(ownerKey)),
    updatedAt: now,
  };
  await getDynamoClient().send(new PutCommand({ TableName: getDynamoTableName(), Item: item }));
  return dashboardView(settings);
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

function profileView(id: string, name: string, isDefault: boolean, stored: StoredCypressProfile): CypressProfileView {
  const secretKeys = new Set(storedSecretKeys(stored));
  return {
    id,
    name,
    isDefault,
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

async function listHostedProfileItems(ownerKey: string) {
  const result = await getDynamoClient().send(new QueryCommand({
    TableName: getDynamoTableName(),
    KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
    ExpressionAttributeValues: { ":pk": ownerPartitionKey(ownerKey), ":prefix": DYNAMO_KEY.PROFILE_PREFIX },
    ConsistentRead: true,
  }));
  return (result.Items || []) as CypressProfileItem[];
}

function decryptProfile(ownerKey: string, item: CypressProfileItem) {
  return decryptValue<StoredCypressProfile>(item.encrypted, profileContext(ownerKey, item.id));
}

export async function listCypressProfiles(ownerKey: string) {
  if (config.isLocal) {
    return (await readLocalStore()).profiles.filter((profile) => profile.ownerKey === ownerKey)
      .sort((left, right) => Number(right.isDefault) - Number(left.isDefault) || left.name.localeCompare(right.name))
      .map((profile) => profileView(profile.id, profile.name, profile.isDefault, profile.environment));
  }
  const items = await listHostedProfileItems(ownerKey);
  return items
    .sort((left, right) => Number(right.isDefault) - Number(left.isDefault) || left.name.localeCompare(right.name))
    .map((item) => profileView(item.id, item.name, item.isDefault, decryptProfile(ownerKey, item)));
}

async function getHostedProfileItem(ownerKey: string, profileId: string) {
  const result = await getDynamoClient().send(new GetCommand({
    TableName: getDynamoTableName(),
    Key: { pk: ownerPartitionKey(ownerKey), sk: profileSortKey(profileId) },
    ConsistentRead: true,
  }));
  return result.Item as CypressProfileItem | undefined;
}

export async function getCypressProfileSecret(ownerKey: string, profileId: string) {
  if (config.isLocal) {
    const stored = (await readLocalStore()).profiles.find((profile) => profile.ownerKey === ownerKey && profile.id === profileId);
    if (!stored) return null;
    return {
      row: { id: stored.id, ownerKey, name: stored.name, isDefault: stored.isDefault },
      profile: profileView(stored.id, stored.name, stored.isDefault, stored.environment),
      environment: stored.environment,
    };
  }
  const item = await getHostedProfileItem(ownerKey, profileId);
  if (!item) return null;
  const stored = decryptProfile(ownerKey, item);
  return {
    row: { id: item.id, ownerKey, name: item.name, isDefault: item.isDefault },
    profile: profileView(item.id, item.name, item.isDefault, stored),
    environment: {
      baseUrl: stored.baseUrl,
      env: stored.env,
      secretKeys: storedSecretKeys(stored),
    } as CypressProfileSecret,
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
      return profileView(stored.id, stored.name, stored.isDefault, stored.environment);
    });
  }

  const id = profileId || crypto.randomUUID();
  const existing = profileId ? await getHostedProfileItem(ownerKey, profileId) : undefined;
  if (profileId && !existing) throw new Error("Cypress profile was not found");
  const stored = toStoredProfile(input, existing ? decryptProfile(ownerKey, existing) : undefined);
  const item: CypressProfileItem = {
    pk: ownerPartitionKey(ownerKey),
    sk: profileSortKey(id),
    entity: DYNAMO_ENTITY.CYPRESS_PROFILE,
    id,
    name: input.name,
    isDefault: input.isDefault,
    encrypted: encryptValue(stored, profileContext(ownerKey, id)),
    updatedAt: new Date().toISOString(),
  };

  if (input.isDefault) {
    const otherDefaults = (await listHostedProfileItems(ownerKey)).filter((profile) => profile.isDefault && profile.id !== id);
    if (otherDefaults.length > 98) throw new Error("Too many Cypress profiles");
    await getDynamoClient().send(new TransactWriteCommand({
      TransactItems: [
        ...otherDefaults.map((profile) => ({
          Update: {
            TableName: getDynamoTableName(),
            Key: { pk: profile.pk, sk: profile.sk },
            UpdateExpression: "SET isDefault = :false, updatedAt = :now",
            ExpressionAttributeValues: { ":false": false, ":now": item.updatedAt },
          },
        })),
        { Put: { TableName: getDynamoTableName(), Item: item } },
      ],
    }));
  } else {
    await getDynamoClient().send(new PutCommand({ TableName: getDynamoTableName(), Item: item }));
  }
  return profileView(id, item.name, item.isDefault, stored);
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
  const result = await getDynamoClient().send(new DeleteCommand({
    TableName: getDynamoTableName(),
    Key: { pk: ownerPartitionKey(ownerKey), sk: profileSortKey(profileId) },
    ReturnValues: "ALL_OLD",
  }));
  return Boolean(result.Attributes);
}

export async function createRunProfileSnapshot(requestId: string, snapshot: RunProfileSnapshot) {
  if (config.isLocal) {
    await updateLocalStore((store) => {
      const now = Date.now();
      for (const [id, stored] of Object.entries(store.snapshots)) if (Date.parse(stored.expiresAt) <= now) delete store.snapshots[id];
      store.snapshots[requestId] = { value: snapshot, expiresAt: new Date(now + TIME.PROFILE_SNAPSHOT_TTL_SECONDS * TIME.MILLISECONDS_PER_SECOND).toISOString() };
    });
    return;
  }
  await getDynamoClient().send(new PutCommand({
    TableName: getDynamoTableName(),
    Item: {
      pk: snapshotKey(requestId),
      sk: DYNAMO_KEY.SNAPSHOT,
      entity: DYNAMO_ENTITY.RUN_PROFILE_SNAPSHOT,
      encrypted: encryptValue(snapshot, `snapshot:${requestId}`),
      expiresAtEpoch: Math.floor(Date.now() / TIME.MILLISECONDS_PER_SECOND) + TIME.PROFILE_SNAPSHOT_TTL_SECONDS,
    },
    ConditionExpression: "attribute_not_exists(pk)",
  }));
}

export async function consumeRunProfileSnapshot(requestId: string) {
  if (config.isLocal) {
    return updateLocalStore((store) => {
      const stored = store.snapshots[requestId];
      delete store.snapshots[requestId];
      return stored && Date.parse(stored.expiresAt) > Date.now() ? stored.value : null;
    });
  }
  const result = await getDynamoClient().send(new DeleteCommand({
    TableName: getDynamoTableName(),
    Key: { pk: snapshotKey(requestId), sk: DYNAMO_KEY.SNAPSHOT },
    ReturnValues: "ALL_OLD",
  }));
  const item = result.Attributes as { encrypted?: EncryptedValue; expiresAtEpoch?: number } | undefined;
  if (!item?.encrypted || !item.expiresAtEpoch || item.expiresAtEpoch <= Math.floor(Date.now() / TIME.MILLISECONDS_PER_SECOND)) return null;
  return decryptValue<RunProfileSnapshot>(item.encrypted, `snapshot:${requestId}`);
}
