import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// One random key per installation, wrapped by Windows DPAPI in the main process.
// The record identity is authenticated so swapping ciphertext between rows fails.
export class RecordCipher {
  private readonly key: Buffer;
  constructor(key: Buffer) {
    if (key.length !== 32) throw new Error("Clave local no válida.");
    this.key = Buffer.from(key);
  }
  seal(value: unknown, identity: string) {
    const nonce = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", this.key, nonce);
    cipher.setAAD(Buffer.from(identity));
    const bytes = Buffer.concat([
      cipher.update(JSON.stringify(value), "utf8"),
      cipher.final(),
    ]);
    return Buffer.concat([nonce, cipher.getAuthTag(), bytes]);
  }
  open<T>(value: Uint8Array, identity: string): T {
    const bytes = Buffer.from(value);
    if (bytes.length < 29)
      throw new Error("El almacenamiento local está dañado.");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.key,
      bytes.subarray(0, 12),
    );
    decipher.setAAD(Buffer.from(identity));
    decipher.setAuthTag(bytes.subarray(12, 28));
    return JSON.parse(
      Buffer.concat([
        decipher.update(bytes.subarray(28)),
        decipher.final(),
      ]).toString("utf8"),
    ) as T;
  }
}
