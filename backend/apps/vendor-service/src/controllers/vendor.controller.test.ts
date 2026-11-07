import { describe, expect, mock, test } from "bun:test";
import { VendorController, toVendorApplyData } from "./vendor.controller.ts";

const USER_ID = "00000000-0000-0000-0000-0000000000aa";
const VENDOR_ID = "00000000-0000-0000-0000-0000000000bb";

const applyBody = {
  business_name: "E2E fix Gulf Board Supplies",
  business_email: "sales@gulfboard.example",
  business_phone: "+971501234567",
  business_address: { street: "Warehouse 4, Al Quoz 3", city: "Dubai", state: "Dubai" },
  tax_registration_number: "100123456700003",
  documents: [{ type: "trade_license", s3_key: "vendor-docs/u1/trade-licence.pdf" }],
};

describe("toVendorApplyData (POST /vendors/apply body mapping)", () => {
  test("maps snake_case documents onto s3Key/fileName the service reads", () => {
    const data = toVendorApplyData(USER_ID, applyBody);
    expect(data.documents).toEqual([
      {
        type: "trade_license",
        s3Key: "vendor-docs/u1/trade-licence.pdf",
        fileName: "trade-licence.pdf",
      },
    ]);
  });

  test("keeps an explicit file_name", () => {
    const data = toVendorApplyData(USER_ID, {
      ...applyBody,
      documents: [{ type: "vat_certificate", s3_key: "k/abc", file_name: "VAT cert.pdf" }],
    });
    expect(data.documents[0].fileName).toBe("VAT cert.pdf");
  });

  test("maps address and contact fields; bank account is optional", () => {
    const data = toVendorApplyData(USER_ID, applyBody);
    expect(data.userId).toBe(USER_ID);
    expect(data.businessName).toBe("E2E fix Gulf Board Supplies");
    expect(data.businessEmail).toBe("sales@gulfboard.example");
    expect(data.businessAddress).toEqual({
      street: "Warehouse 4, Al Quoz 3",
      city: "Dubai",
      state: "Dubai",
      country: "AE",
      postalCode: "",
    });
    expect(data.bankAccount).toBeUndefined();
  });

  test("maps a supplied bank account to camelCase", () => {
    const data = toVendorApplyData(USER_ID, {
      ...applyBody,
      bank_account: {
        bank_name: "Emirates NBD",
        account_holder_name: "Gulf Board Supplies LLC",
        account_number: "1012345678901",
        iban: "AE070331234567890123456",
      },
    });
    expect(data.bankAccount).toEqual({
      bankName: "Emirates NBD",
      accountHolderName: "Gulf Board Supplies LLC",
      accountNumber: "1012345678901",
      iban: "AE070331234567890123456",
      swiftCode: undefined,
      currency: undefined,
    });
  });

  test("blank TRN becomes undefined", () => {
    expect(
      toVendorApplyData(USER_ID, { ...applyBody, tax_registration_number: "" })
        .taxRegistrationNumber,
    ).toBeUndefined();
  });
});

function makeController(status: string) {
  const transitions: string[] = [];
  const vendorService: any = {
    apply: mock(async () => ({ id: VENDOR_ID })),
    findById: mock(async () => ({ id: VENDOR_ID, status })),
    transition: mock(async (_id: string, next: string) => {
      transitions.push(next);
      return { id: VENDOR_ID, name: "E2E fix", status: next };
    }),
    findOwnerUserId: mock(async () => null),
  };
  const bankAccountService: any = { create: mock(async () => ({})) };
  const controller = new VendorController(vendorService, bankAccountService, {} as any, {} as any);
  return { controller, vendorService, bankAccountService, transitions };
}

describe("VendorController.apply", () => {
  test("passes mapped documents to the service and skips bank creation when absent", async () => {
    const { controller, vendorService, bankAccountService } = makeController("pending");
    await controller.apply(USER_ID, applyBody);
    const arg = vendorService.apply.mock.calls[0][0];
    expect(arg.documents[0].s3Key).toBe("vendor-docs/u1/trade-licence.pdf");
    expect(bankAccountService.create).not.toHaveBeenCalled();
  });

  test("creates the first bank account when one is supplied", async () => {
    const { controller, bankAccountService } = makeController("pending");
    await controller.apply(USER_ID, {
      ...applyBody,
      bank_account: {
        bank_name: "Emirates NBD",
        account_holder_name: "Gulf Board Supplies LLC",
        account_number: "1012345678901",
        iban: "AE070331234567890123456",
      },
    });
    expect(bankAccountService.create).toHaveBeenCalledTimes(1);
    expect(bankAccountService.create.mock.calls[0][1].accountNumber).toBe("1012345678901");
  });
});

describe("VendorController.approve / reactivate", () => {
  test("approve on a pending application goes via under_review", async () => {
    const { controller, transitions } = makeController("pending");
    await controller.approve(VENDOR_ID, "admin");
    expect(transitions).toEqual(["under_review", "approved"]);
  });

  test("approve on an application already under review goes straight to approved", async () => {
    const { controller, transitions } = makeController("under_review");
    await controller.approve(VENDOR_ID, "admin");
    expect(transitions).toEqual(["approved"]);
  });

  test("approve refuses a suspended vendor (that is reactivate)", async () => {
    const { controller, transitions } = makeController("suspended");
    await expect(controller.approve(VENDOR_ID, "admin")).rejects.toMatchObject({
      statusCode: 422,
      code: "INVALID_TRANSITION",
    });
    expect(transitions).toEqual([]);
  });

  test("reactivate moves a suspended vendor straight to approved", async () => {
    const { controller, transitions } = makeController("suspended");
    const v = await controller.reactivate(VENDOR_ID, "admin");
    expect(transitions).toEqual(["approved"]);
    expect(v.status).toBe("approved");
  });

  test("reactivate refuses a vendor that is not suspended", async () => {
    const { controller, transitions } = makeController("pending");
    await expect(controller.reactivate(VENDOR_ID, "admin")).rejects.toMatchObject({
      statusCode: 422,
      code: "VENDOR_NOT_SUSPENDED",
    });
    expect(transitions).toEqual([]);
  });
});
