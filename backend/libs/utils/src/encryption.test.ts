import { describe, expect, test } from "bun:test";
import { EncryptionService } from "./encryption.service.ts";

describe("EncryptionService", () => {
  const key = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const svc = new EncryptionService(key);

  test("encrypt returns a string different from input", () => {
    const encrypted = svc.encrypt("secret-data");
    expect(encrypted).not.toBe("secret-data");
    expect(encrypted).toContain(":");
  });

  test("decrypt recovers original plaintext", () => {
    const plaintext = "AE070012345678901234";
    const encrypted = svc.encrypt(plaintext);
    const decrypted = svc.decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  test("different encryptions of same input produce different ciphertexts", () => {
    const a = svc.encrypt("same-input");
    const b = svc.encrypt("same-input");
    expect(a).not.toBe(b);
  });

  test("decrypt with wrong key throws", () => {
    const wrongKey = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
    const wrongSvc = new EncryptionService(wrongKey);
    const encrypted = svc.encrypt("secret");
    expect(() => wrongSvc.decrypt(encrypted)).toThrow();
  });

  test("mask returns last 4 chars with asterisks", () => {
    expect(svc.mask("1234567890")).toBe("******7890");
    expect(svc.mask("AB")).toBe("AB");
  });
});

describe("EncryptionService.encryptObject/decryptObject", () => {
  const KEY = "0".repeat(64); // 32-byte hex key

  test("round-trips a plain object", () => {
    const svc = new EncryptionService(KEY);
    const original = { api_key: "sk_live_123", account: "acc_42" };
    const encrypted = svc.encryptObject(original);
    expect(typeof encrypted).toBe("string");
    expect(encrypted).not.toContain("sk_live_123");
    const decrypted = svc.decryptObject(encrypted);
    expect(decrypted).toEqual(original);
  });

  test("decryptObject throws on tampered ciphertext", () => {
    const svc = new EncryptionService(KEY);
    const enc = svc.encryptObject({ a: "b" });
    const tampered = `${enc.slice(0, -4)}0000`;
    expect(() => svc.decryptObject(tampered)).toThrow();
  });
});
