import { createHash } from "node:crypto";

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function checksumOf(value: unknown): string {
  return sha256Hex(JSON.stringify(value));
}
