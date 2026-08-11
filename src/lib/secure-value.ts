import "server-only";

import { decryptJson, encryptJson, type EncryptedEnvelope } from "./authenticated-encryption";
import { config } from "./config";

export type EncryptedValue = EncryptedEnvelope;

const ENCRYPTION_NAMESPACE = "failure-intelligence-dynamodb";

function encryptionSecret() {
  if (!config.aws.dataEncryptionKey) throw new Error("DATA_ENCRYPTION_KEY is not configured");
  return config.aws.dataEncryptionKey;
}

export function encryptValue(value: unknown, context: string): EncryptedValue {
  return encryptJson(value, {
    secret: encryptionSecret(),
    namespace: ENCRYPTION_NAMESPACE,
    authenticatedContext: context,
  });
}

export function decryptValue<T>(value: EncryptedValue, context: string): T {
  return decryptJson<T>(value, {
    secret: encryptionSecret(),
    namespace: ENCRYPTION_NAMESPACE,
    authenticatedContext: context,
  });
}
