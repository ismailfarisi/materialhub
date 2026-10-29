import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { config } from "@materialhub/config";
import { AppDataSource, User, UserTwoFactor } from "@materialhub/database";
import { BadRequestError, NotFoundError } from "@materialhub/plugins";

// ---------------------------------------------------------------------------
// AES-256-GCM encryption helpers
// ---------------------------------------------------------------------------

function getEncryptionKey(): Buffer {
  const keyStr = config.twoFa.encryptionKey;
  const keyBuffer = Buffer.from(keyStr, "utf8");
  if (keyBuffer.length === 32) return keyBuffer;
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(keyStr);
  return Buffer.from(hasher.digest("hex").slice(0, 64), "hex");
}

function encrypt(text: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, encrypted, authTag]).toString("hex");
}

function decrypt(hex: string, key: Buffer): string {
  const data = Buffer.from(hex, "hex");
  const iv = data.subarray(0, 12);
  const authTag = data.subarray(data.length - 16);
  const encrypted = data.subarray(12, data.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final("utf8");
}

// ---------------------------------------------------------------------------
// Base32 encode/decode (RFC 4648)
// ---------------------------------------------------------------------------

const BASE32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i]!;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += BASE32_CHARS[(value >>> bits) & 0x1f];
    }
  }

  if (bits > 0) {
    output += BASE32_CHARS[(value << (5 - bits)) & 0x1f];
  }

  return output;
}

function base32Decode(str: string): Buffer {
  const cleanStr = str.replace(/=+$/, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (let i = 0; i < cleanStr.length; i++) {
    const idx = BASE32_CHARS.indexOf(cleanStr[i]!);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      output.push((value >>> bits) & 0xff);
    }
  }

  return Buffer.from(output);
}

// ---------------------------------------------------------------------------
// TOTP generation and verification (RFC 6238 / RFC 4226)
// ---------------------------------------------------------------------------

function verifyTOTP(secret: Buffer, code: string, window = 1): boolean {
  const currentTime = Math.floor(Date.now() / 1000 / 30);
  for (let i = -window; i <= window; i++) {
    const time = currentTime + i;
    const timeBuffer = Buffer.alloc(8);
    timeBuffer.writeBigInt64BE(BigInt(time));
    const hmac = createHmac("sha1", secret).update(timeBuffer).digest();
    const offset = hmac[hmac.length - 1]! & 0x0f;
    const otp =
      (((hmac[offset]! & 0x7f) << 24) |
        (hmac[offset + 1]! << 16) |
        (hmac[offset + 2]! << 8) |
        hmac[offset + 3]!) %
      1000000;
    if (otp.toString().padStart(6, "0") === code) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// SHA-256 helper for backup codes
// ---------------------------------------------------------------------------

function sha256(input: string): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(input);
  return hasher.digest("hex");
}

// ---------------------------------------------------------------------------
// TwoFactorService
// ---------------------------------------------------------------------------

export class TwoFactorService {
  private twoFactorRepo = AppDataSource.getRepository(UserTwoFactor);
  private userRepo = AppDataSource.getRepository(User);

  async enableSetup(userId: string): Promise<{ secret: string; otpauth_uri: string }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundError("User not found");
    }

    const secretBytes = randomBytes(20);
    const base32Secret = base32Encode(secretBytes);

    const encryptionKey = getEncryptionKey();
    const encryptedSecret = encrypt(base32Secret, encryptionKey);

    const existing = await this.twoFactorRepo.findOne({
      where: { user_id: userId },
    });

    if (existing) {
      if (existing.is_enabled) {
        throw new BadRequestError("2FA is already enabled. Disable it first before re-enabling.");
      }
      await this.twoFactorRepo.update(
        { id: existing.id },
        {
          secret_encrypted: encryptedSecret,
          is_enabled: false,
          enabled_at: null,
          backup_codes_encrypted: "[]",
        },
      );
    } else {
      const record = this.twoFactorRepo.create({
        user_id: userId,
        secret_encrypted: encryptedSecret,
        backup_codes_encrypted: "[]",
        is_enabled: false,
      });
      await this.twoFactorRepo.save(record);
    }

    const otpauthUri = `otpauth://totp/MaterialHub:${encodeURIComponent(user.email)}?secret=${base32Secret}&issuer=MaterialHub`;

    return { secret: base32Secret, otpauth_uri: otpauthUri };
  }

  async verifyAndEnable(userId: string, code: string): Promise<{ backup_codes: string[] }> {
    const record = await this.twoFactorRepo.findOne({
      where: { user_id: userId },
    });
    if (!record) {
      throw new BadRequestError("2FA setup not initiated. Call enable-setup first.");
    }

    if (record.is_enabled) {
      throw new BadRequestError("2FA is already enabled.");
    }

    const encryptionKey = getEncryptionKey();
    const base32Secret = decrypt(record.secret_encrypted, encryptionKey);
    const secretBytes = base32Decode(base32Secret);

    if (!verifyTOTP(secretBytes, code)) {
      throw new BadRequestError("Invalid TOTP code. Please try again.");
    }

    const backupCodes: string[] = [];
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

    for (let i = 0; i < 10; i++) {
      let backupCode = "";
      const bytes = randomBytes(8);
      for (let j = 0; j < 8; j++) {
        backupCode += chars[bytes[j]! % chars.length];
      }
      backupCodes.push(backupCode);
    }

    const hashedCodes = backupCodes.map((c) => sha256(c));
    const encryptedBackupCodes = encrypt(JSON.stringify(hashedCodes), encryptionKey);

    await this.twoFactorRepo.update(
      { id: record.id },
      {
        is_enabled: true,
        enabled_at: new Date(),
        backup_codes_encrypted: encryptedBackupCodes,
      },
    );

    return { backup_codes: backupCodes };
  }

  async verifyCode(userId: string, code: string): Promise<boolean> {
    const record = await this.twoFactorRepo.findOne({
      where: { user_id: userId },
    });
    if (!record || !record.is_enabled) {
      throw new BadRequestError("2FA is not enabled for this user.");
    }

    const encryptionKey = getEncryptionKey();
    const base32Secret = decrypt(record.secret_encrypted, encryptionKey);
    const secretBytes = base32Decode(base32Secret);

    const valid = verifyTOTP(secretBytes, code);
    if (valid) {
      await this.twoFactorRepo.update({ id: record.id }, { last_used_at: new Date() });
    }

    return valid;
  }

  async verifyBackupCode(userId: string, code: string): Promise<boolean> {
    const record = await this.twoFactorRepo.findOne({
      where: { user_id: userId },
    });
    if (!record || !record.is_enabled) {
      throw new BadRequestError("2FA is not enabled for this user.");
    }

    const encryptionKey = getEncryptionKey();
    const codeHash = sha256(code.toUpperCase().trim());

    let hashedCodes: string[];
    try {
      const decrypted = decrypt(record.backup_codes_encrypted, encryptionKey);
      hashedCodes = JSON.parse(decrypted);
    } catch {
      throw new BadRequestError("Failed to verify backup code.");
    }

    // Constant-time comparison — check all codes to prevent timing side-channels
    const codeHashBuf = Buffer.from(codeHash, "hex");
    let matchIndex = -1;
    for (let i = 0; i < hashedCodes.length; i++) {
      const storedBuf = Buffer.from(hashedCodes[i]!, "hex");
      if (codeHashBuf.length === storedBuf.length && timingSafeEqual(codeHashBuf, storedBuf)) {
        matchIndex = i;
      }
    }

    if (matchIndex === -1) {
      return false;
    }

    hashedCodes.splice(matchIndex, 1);

    const encryptedBackupCodes = encrypt(JSON.stringify(hashedCodes), encryptionKey);
    await this.twoFactorRepo.update(
      { id: record.id },
      {
        backup_codes_encrypted: encryptedBackupCodes,
        last_used_at: new Date(),
      },
    );

    return true;
  }

  async disable(userId: string, code: string): Promise<void> {
    const record = await this.twoFactorRepo.findOne({
      where: { user_id: userId },
    });
    if (!record || !record.is_enabled) {
      throw new BadRequestError("2FA is not enabled for this user.");
    }

    let totpValid = false;
    try {
      totpValid = await this.verifyCode(userId, code);
    } catch (e: unknown) {
      // Only swallow BadRequestError (e.g. "2FA not enabled"), re-throw unexpected errors
      if (!(e instanceof BadRequestError)) throw e;
    }
    if (!totpValid) {
      const backupValid = await this.verifyBackupCode(userId, code);
      if (!backupValid) {
        throw new BadRequestError("Invalid verification code.");
      }
    }

    await this.twoFactorRepo.update(
      { id: record.id },
      {
        is_enabled: false,
        enabled_at: null,
        secret_encrypted: "",
        backup_codes_encrypted: "[]",
      },
    );
  }

  async isEnabled(userId: string): Promise<boolean> {
    const record = await this.twoFactorRepo.findOne({
      where: { user_id: userId },
    });
    return record?.is_enabled === true;
  }
}
