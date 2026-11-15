import "server-only";
import { createHash, randomBytes } from "node:crypto";

/** A new private key for a phone. Only its hash is stored; the key itself is shown once. */
export function newIngestToken() {
  const token = `lh_${randomBytes(24).toString("base64url")}`;
  return { token, hash: hashIngestToken(token), hint: token.slice(-4) };
}

export function hashIngestToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
