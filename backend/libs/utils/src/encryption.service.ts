import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;

export class EncryptionService {
  private readonly keyBuffer: Buffer;

  constructor(hexKey: string) {
    this.keyBuffer = Buffer.from(hexKey, "hex");
    if (this.keyBuffer.length !== 32) {
      throw new Error("Encryption key must be 32 bytes (64 hex chars)");
    }
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.keyBuffer, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
  }

  decrypt(ciphertext: string): string {
    const parts = ciphertext.split(":");
    const ivHex = parts[0] ?? "";
    const authTagHex = parts[1] ?? "";
    const encryptedHex = parts[2] ?? "";
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const encrypted = Buffer.from(encryptedHex, "hex");
    const decipher = createDecipheriv(ALGORITHM, this.keyBuffer, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  }

  mask(value: string): string {
    if (value.length <= 4) return value;
    return "*".repeat(value.length - 4) + value.slice(-4);
  }

  encryptObject(obj: Record<string, unknown>): string {
    return this.encrypt(JSON.stringify(obj));
  }

  decryptObject<T = Record<string, unknown>>(ciphertext: string): T {
    return JSON.parse(this.decrypt(ciphertext)) as T;
  }
}
