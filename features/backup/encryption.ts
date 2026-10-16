// Browser-side authenticated encryption. The backup passphrase never reaches the server.
import { passwordSchema } from "@/lib/auth/validation";
import { backupMaxBytes as MAX_BYTES, backupLimitMessage } from "./limits";
const MAGIC = new TextEncoder().encode("MAPPLEO1");
const HEADER_BYTES = 36; // format/version (8), random salt (16), random nonce (12)
const ITERATIONS = 600000;
export function encryptedBackup(bytes: Uint8Array) {
  return (
    bytes.length >= HEADER_BYTES + 16 &&
    MAGIC.every((byte, index) => bytes[index] === byte)
  );
}
async function key(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  usage: KeyUsage[],
) {
  if (password.length < 8 || password.length > 128)
    throw new Error(
      "La contraseña del backup debe tener entre 8 y 128 caracteres.",
    );
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    usage,
  );
}
export async function encryptBackup(
  plain: Uint8Array<ArrayBuffer>,
  password: string,
) {
  const validated = passwordSchema.safeParse(password);
  if (!validated.success) throw new Error(validated.error.issues[0].message);
  if (plain.length > MAX_BYTES) throw new Error(backupLimitMessage);
  const salt = crypto.getRandomValues(new Uint8Array(16)),
    iv = crypto.getRandomValues(new Uint8Array(12));
  const header = new Uint8Array(HEADER_BYTES);
  header.set(MAGIC);
  header.set(salt, 8);
  header.set(iv, 24);
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: header, tagLength: 128 },
      await key(password, salt, ["encrypt"]),
      plain,
    ),
  );
  const result = new Uint8Array(HEADER_BYTES + cipher.length);
  result.set(header);
  result.set(cipher, HEADER_BYTES);
  return result;
}
export async function decryptBackup(
  bytes: Uint8Array<ArrayBuffer>,
  password: string,
) {
  if (!encryptedBackup(bytes) || bytes.length > MAX_BYTES + HEADER_BYTES + 16)
    throw new Error("El archivo cifrado no tiene un formato o tamaño válido.");
  const header = bytes.slice(0, HEADER_BYTES);
  try {
    return new Uint8Array(
      await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: header.slice(24, 36),
          additionalData: header,
          tagLength: 128,
        },
        await key(password, header.slice(8, 24), ["decrypt"]),
        bytes.slice(HEADER_BYTES),
      ),
    );
  } catch {
    throw new Error(
      "La contraseña del backup es incorrecta o el archivo está dañado.",
    );
  }
}
