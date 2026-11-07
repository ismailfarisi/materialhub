import { describe, expect, mock, test } from "bun:test";
import { EncryptionService } from "@materialhub/utils";
import { VendorBankAccountService } from "./vendor-bank-account.service.ts";

const KEY = "0".repeat(64);
const VENDOR_ID = "00000000-0000-0000-0000-0000000000bb";

function makeService(existing: any[] = []) {
  const encryption = new EncryptionService(KEY);
  const service = new VendorBankAccountService(encryption);
  const saved: any[] = [];
  const repo = {
    find: mock(async () => existing),
    create: (d: any) => ({ id: "acc-1", ...d }),
    save: mock(async (d: any) => {
      saved.push(d);
      return d;
    }),
    findOne: mock(async () => existing[0] ?? null),
  };
  Object.defineProperty(service, "repo", { get: () => repo });
  return { service, encryption, repo, saved };
}

describe("VendorBankAccountService masking", () => {
  test("create() stores ciphertext and returns only masked values", async () => {
    const { service, saved } = makeService();
    const view = await service.create(VENDOR_ID, {
      bankName: "Emirates NBD",
      accountHolderName: "E2E fix Gulf Board Supplies LLC",
      accountNumber: "1012345678901",
      iban: "AE070331234567890123456",
    });
    expect(saved[0].account_number_encrypted).not.toContain("1012345678901");
    expect(view).toEqual({
      id: "acc-1",
      bankName: "Emirates NBD",
      accountHolderName: "E2E fix Gulf Board Supplies LLC",
      accountNumberMasked: "*********8901",
      ibanMasked: "*******************3456",
      swiftCode: null,
      currency: "AED",
      isPrimary: true,
    });
    const json = JSON.stringify(view);
    expect(json).not.toContain("1012345678901");
    expect(json).not.toContain("encrypted");
  });

  test("update() returns the masked view, not the entity", async () => {
    const encryption = new EncryptionService(KEY);
    const row = {
      id: "acc-1",
      vendor_id: VENDOR_ID,
      bank_name: "ADCB",
      account_holder_name: "Holder",
      account_number_encrypted: encryption.encrypt("5550001112223"),
      iban_encrypted: null,
      swift_code: null,
      currency: "AED",
      is_primary: false,
    };
    const { service } = makeService([row]);
    const view: any = await service.update(VENDOR_ID, "acc-1", { bankName: "Mashreq" });
    expect(view.bankName).toBe("Mashreq");
    expect(view.accountNumberMasked).toBe("*********2223");
    expect(view.account_number_encrypted).toBeUndefined();
  });

  test("an undecryptable row masks to **** instead of leaking ciphertext", () => {
    const { service } = makeService();
    const view = service.toView({
      id: "x",
      bank_name: "b",
      account_holder_name: "h",
      account_number_encrypted: "not-valid-ciphertext",
      iban_encrypted: null,
      swift_code: null,
      currency: "AED",
      is_primary: true,
    } as any);
    expect(view.accountNumberMasked).toBe("****");
  });
});

describe("normalizeBankDetails", () => {
  test("strips spaces and uppercases the IBAN", async () => {
    const { normalizeBankDetails } = await import("./vendor-bank-account.service.ts");
    expect(
      normalizeBankDetails({ iban: "ae07 0331 2345 6789 0123 456", accountNumber: " 1012 3456 " }),
    ).toEqual({
      iban: "AE070331234567890123456",
      accountNumber: "10123456",
    });
  });

  test("errors never contain the submitted number", async () => {
    const { normalizeBankDetails } = await import("./vendor-bank-account.service.ts");
    let message = "";
    try {
      normalizeBankDetails({ accountNumber: "12-34-SECRET-99999999999999999999999999999" });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/Account number/);
    expect(message).not.toContain("SECRET");
    expect(() => normalizeBankDetails({ iban: "XX1" })).toThrow(/IBAN is not valid/);
  });
});
