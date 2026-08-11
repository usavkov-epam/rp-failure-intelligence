import "server-only";

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { decryptJson, encryptJson, type EncryptedEnvelope } from "./authenticated-encryption";
import { config } from "./config";
import type { CypressRunDetails, CypressRunRecord } from "./types";
import type { CypressProfileSecret, DashboardSettingsInput, RunProfileSnapshot } from "./user-settings-schema";

export interface LocalProfileRecord {
  id: string;
  ownerKey: string;
  name: string;
  isDefault: boolean;
  environment: CypressProfileSecret;
}

export interface LocalRunRecord extends CypressRunRecord {
  ownerKey: string;
  requestedBy: string;
  localJobs?: CypressRunDetails["jobs"];
  localArtifacts?: Array<CypressRunDetails["artifacts"][number] & { path: string }>;
}

export interface LocalStoreData {
  version: 1;
  dashboard?: { ownerKey: string; settings: DashboardSettingsInput };
  profiles: LocalProfileRecord[];
  runs: LocalRunRecord[];
  snapshots: Record<string, { value: RunProfileSnapshot; expiresAt: string }>;
}

const emptyStore = (): LocalStoreData => ({ version: 1, profiles: [], runs: [], snapshots: {} });
let writeQueue: Promise<unknown> = Promise.resolve();
const ENCRYPTION_NAMESPACE = "failure-intelligence-local-store";

function storagePath() {
  return path.join(config.localStorage.dataDirectory, "store.enc.json");
}

function encryptionSecret() {
  if (!config.isLocal || !config.localStorage.encryptionKey) throw new Error("Encrypted local storage is not configured");
  return config.localStorage.encryptionKey;
}

function encrypt(value: LocalStoreData): EncryptedEnvelope {
  return encryptJson(value, { secret: encryptionSecret(), namespace: ENCRYPTION_NAMESPACE });
}

function decrypt(envelope: EncryptedEnvelope): LocalStoreData {
  return decryptJson<LocalStoreData>(envelope, { secret: encryptionSecret(), namespace: ENCRYPTION_NAMESPACE });
}

export async function readLocalStore(): Promise<LocalStoreData> {
  try {
    const envelope = JSON.parse(await readFile(storagePath(), "utf8")) as EncryptedEnvelope;
    return decrypt(envelope);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyStore();
    throw new Error("Unable to read encrypted local data", { cause: error });
  }
}

export async function updateLocalStore<T>(update: (store: LocalStoreData) => T | Promise<T>): Promise<T> {
  const operation = writeQueue.then(async () => {
    const store = await readLocalStore();
    const result = await update(store);
    await mkdir(config.localStorage.dataDirectory, { recursive: true, mode: 0o700 });
    const target = storagePath();
    const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(encrypt(store)), { mode: 0o600 });
    await rename(temporary, target);
    return result;
  });
  writeQueue = operation.catch(() => undefined);
  return operation;
}
