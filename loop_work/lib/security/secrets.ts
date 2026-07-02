import crypto from "crypto";

type EncryptedPayload = {
  secret_ciphertext: string;
  secret_iv: string;
  secret_auth_tag: string;
  secret_hash: string;
  secret_hint: string;
};

function normaliseKey(raw: string): Buffer {
  const trimmed = raw.trim();

  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }

  try {
    const decoded = Buffer.from(trimmed, "base64");
    if (decoded.length === 32) return decoded;
  } catch {}

  try {
    const decoded = Buffer.from(trimmed.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    if (decoded.length === 32) return decoded;
  } catch {}

  if (Buffer.byteLength(trimmed, "utf8") >= 32) {
    return crypto.createHash("sha256").update(trimmed).digest();
  }

  throw new Error("APP_ENCRYPTION_KEY must be a 32-byte base64 key, 64-character hex key, or a long random string.");
}

export function requireAppEncryptionKey() {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("Missing APP_ENCRYPTION_KEY. Generate one with: openssl rand -base64 32");
  }
  return normaliseKey(raw);
}

export function encryptSecret(secret: string): EncryptedPayload {
  const key = requireAppEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const secretHash = crypto.createHash("sha256").update(secret).digest("hex");
  const visibleTail = secret.length >= 4 ? secret.slice(-4) : "set";

  return {
    secret_ciphertext: ciphertext.toString("base64"),
    secret_iv: iv.toString("base64"),
    secret_auth_tag: authTag.toString("base64"),
    secret_hash: secretHash,
    secret_hint: `••••${visibleTail}`,
  };
}

export function decryptSecret(record: {
  secret_ciphertext: string | null;
  secret_iv: string | null;
  secret_auth_tag: string | null;
}) {
  if (!record.secret_ciphertext || !record.secret_iv || !record.secret_auth_tag) {
    return null;
  }

  const key = requireAppEncryptionKey();
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(record.secret_iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(record.secret_auth_tag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(record.secret_ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
