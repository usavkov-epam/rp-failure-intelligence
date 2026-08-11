import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import type { CypressRunRecord } from "./types";
import type { CypressProfileSecret, DashboardSettingsInput, RunProfileSnapshot } from "./user-settings-schema";
import { config } from "./config";

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
}

export interface LocalStoreData {
  version: 1;
  dashboard?: { ownerKey: string; settings: DashboardSettingsInput };
  profiles: LocalProfileRecord[];
  runs: LocalRunRecord[];
  snapshots: Record<string, { value: RunProfileSnapshot; expiresAt: string }>;
}

interface EncryptedEnvelope {
  version: 1;
  iv: string;
  tag: string;
  ciphertext: string;
}

const emptyStore = (): LocalStoreData => ({ version: 1, profiles: [], runs: [], snapshots: {} });
let writeQueue: Promise<unknown> = Promise.resolve();

function storagePath() {
  return path.join(config.localStorage.dataDirectory, "store.enc.json");
}

function encryptionKey() {
  if (!config.isLocal || !config.localStorage.encryptionKey) throw new Error("Encrypted local storage is not configured");
  return createHash("sha256").update("failure-intelligence-local-store\0").update(config.localStorage.encryptionKey).digest();
}

function encrypt(value: LocalStoreData): EncryptedEnvelope {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return { version: 1, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64") };
}

function decrypt(envelope: EncryptedEnvelope): LocalStoreData {
  if (envelope.version !== 1) throw new Error("Unsupported local storage format");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(envelope.iv, "base64"));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, "base64")), decipher.final()]).toString("utf8")) as LocalStoreData;
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
