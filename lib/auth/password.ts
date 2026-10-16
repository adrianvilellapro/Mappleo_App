import { createHash } from "node:crypto";
import { compare } from "bcryptjs";
import { hash, verify } from "@node-rs/argon2";

const PREFIX = "sha256-bcrypt$";

function preparePassword(password: string) {
  return createHash("sha256").update(password, "utf8").digest("hex");
}

export async function hashPassword(password: string) {
  return hash(password, {
    algorithm: 2,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}

export async function verifyPassword(password: string, storedHash: string) {
  if (storedHash.startsWith("$argon2id$")) return verify(storedHash, password);
  if (storedHash.startsWith(PREFIX))
    return compare(preparePassword(password), storedHash.slice(PREFIX.length));
  // Passwords created before this change used bcrypt directly.
  return compare(password, storedHash);
}
