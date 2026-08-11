import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ENCRYPTION = {
  ALGORITHM: "aes-256-gcm",
  IV_BYTES: 12,
  FORMAT_VERSION: 1,
  KEY_DERIVATION_SEPARATOR: "\0",
} as const;

export interface EncryptedEnvelope {
  version: typeof ENCRYPTION.FORMAT_VERSION;
  iv: string;
  tag: string;
  ciphertext: string;
}

interface EncryptionContext {
  secret: string;
  namespace: string;
  authenticatedContext?: string;
}

function encryptionKey({ secret, namespace }: EncryptionContext) {
  return createHash("sha256")
    .update(namespace)
    .update(ENCRYPTION.KEY_DERIVATION_SEPARATOR)
    .update(secret)
    .digest();
}

/** Encrypts JSON with a random IV and optional authenticated, non-encrypted context. */
export function encryptJson(value: unknown, context: EncryptionContext): EncryptedEnvelope {
  const iv = randomBytes(ENCRYPTION.IV_BYTES);
  const cipher = createCipheriv(ENCRYPTION.ALGORITHM, encryptionKey(context), iv);
  if (context.authenticatedContext) cipher.setAAD(Buffer.from(context.authenticatedContext));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return {
    version: ENCRYPTION.FORMAT_VERSION,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

export function decryptJson<T>(envelope: EncryptedEnvelope, context: EncryptionContext): T {
  if (envelope.version !== ENCRYPTION.FORMAT_VERSION) throw new Error("Unsupported encrypted value format");
  const decipher = createDecipheriv(ENCRYPTION.ALGORITHM, encryptionKey(context), Buffer.from(envelope.iv, "base64"));
  if (context.authenticatedContext) decipher.setAAD(Buffer.from(context.authenticatedContext));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(plaintext) as T;
}
