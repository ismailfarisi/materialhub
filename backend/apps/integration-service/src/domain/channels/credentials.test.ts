import { describe, expect, it } from "bun:test";
import {
  type GoogleAdsCredentials,
  type GoogleMerchantCenterCredentials,
  type MetaChannelCredentials,
  readGoogleChannelCredentials,
  readMetaChannelCredentials,
  readTiktokChannelCredentials,
} from "./credentials.ts";

const validMerchantCenter: GoogleMerchantCenterCredentials = {
  merchantId: "1234567890",
  serviceAccount: {
    client_email: "feed-pusher@example.iam.gserviceaccount.com",
    private_key: "-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----\n",
  },
};

const validGoogleAds: GoogleAdsCredentials = {
  developerToken: "dev-token-xyz",
  customerId: "1112223333",
  conversionActionId: "9876543210",
  oauthClient: {
    clientId: "client-id",
    clientSecret: "client-secret",
    refreshToken: "refresh-token",
  },
};

describe("readGoogleChannelCredentials — legacy flat shape", () => {
  it("promotes a flat {merchantId, serviceAccount} blob to the nested shape with null googleAds", () => {
    const out = readGoogleChannelCredentials({ ...validMerchantCenter });
    expect(out.merchantCenter.merchantId).toBe("1234567890");
    expect(out.merchantCenter.serviceAccount.client_email).toBe(
      "feed-pusher@example.iam.gserviceaccount.com",
    );
    expect(out.googleAds).toBeNull();
  });

  it("preserves optional token_uri on the service account when present", () => {
    const out = readGoogleChannelCredentials({
      merchantId: "1",
      serviceAccount: {
        client_email: "x@y.com",
        private_key: "k",
        token_uri: "https://oauth2.googleapis.com/token",
      },
    });
    expect(out.merchantCenter.serviceAccount.token_uri).toBe("https://oauth2.googleapis.com/token");
    expect(out.googleAds).toBeNull();
  });
});

describe("readGoogleChannelCredentials — nested shape", () => {
  it("returns merchantCenter and googleAds when both are present and valid", () => {
    const out = readGoogleChannelCredentials({
      merchantCenter: validMerchantCenter,
      googleAds: validGoogleAds,
    });
    expect(out.merchantCenter.merchantId).toBe("1234567890");
    expect(out.googleAds).not.toBeNull();
    expect(out.googleAds?.developerToken).toBe("dev-token-xyz");
    expect(out.googleAds?.customerId).toBe("1112223333");
    expect(out.googleAds?.conversionActionId).toBe("9876543210");
    expect(out.googleAds?.oauthClient.refreshToken).toBe("refresh-token");
  });

  it("returns null googleAds when the nested blob explicitly sets it to null", () => {
    const out = readGoogleChannelCredentials({
      merchantCenter: validMerchantCenter,
      googleAds: null,
    });
    expect(out.merchantCenter.merchantId).toBe("1234567890");
    expect(out.googleAds).toBeNull();
  });

  it("returns null googleAds when the nested blob omits the field entirely", () => {
    const out = readGoogleChannelCredentials({ merchantCenter: validMerchantCenter });
    expect(out.googleAds).toBeNull();
  });

  it("preserves optional loginCustomerId on googleAds when present", () => {
    const out = readGoogleChannelCredentials({
      merchantCenter: validMerchantCenter,
      googleAds: { ...validGoogleAds, loginCustomerId: "9990001111" },
    });
    expect(out.googleAds?.loginCustomerId).toBe("9990001111");
  });
});

describe("readGoogleChannelCredentials — invalid shapes", () => {
  it("throws on null", () => {
    expect(() => readGoogleChannelCredentials(null)).toThrow("google_channel_credentials_invalid");
  });

  it("throws on undefined", () => {
    expect(() => readGoogleChannelCredentials(undefined)).toThrow(
      "google_channel_credentials_invalid",
    );
  });

  it("throws on a string primitive", () => {
    expect(() => readGoogleChannelCredentials("nope")).toThrow(
      "google_channel_credentials_invalid",
    );
  });

  it("throws on a number primitive", () => {
    expect(() => readGoogleChannelCredentials(42)).toThrow("google_channel_credentials_invalid");
  });

  it("throws on an empty object (no recognized shape)", () => {
    expect(() => readGoogleChannelCredentials({})).toThrow("google_channel_credentials_invalid");
  });

  it("throws on flat shape missing serviceAccount", () => {
    expect(() => readGoogleChannelCredentials({ merchantId: "1" })).toThrow(
      "google_channel_credentials_invalid",
    );
  });

  it("throws on flat shape with serviceAccount missing private_key", () => {
    expect(() =>
      readGoogleChannelCredentials({
        merchantId: "1",
        serviceAccount: { client_email: "x@y.com" },
      }),
    ).toThrow("google_channel_credentials_invalid");
  });

  it("throws on nested shape with invalid merchantCenter section", () => {
    expect(() =>
      readGoogleChannelCredentials({
        merchantCenter: { merchantId: "" },
        googleAds: null,
      }),
    ).toThrow("google_channel_credentials_invalid");
  });

  it("throws on nested shape with malformed googleAds section", () => {
    expect(() =>
      readGoogleChannelCredentials({
        merchantCenter: validMerchantCenter,
        googleAds: { developerToken: "x" }, // missing required fields
      }),
    ).toThrow("google_channel_credentials_invalid");
  });
});

const validMeta: MetaChannelCredentials = {
  pixelId: "1111111111",
  catalogId: "2222222222",
  businessId: "3333333333",
  accessToken: "EAAFakeSystemUserToken",
};

describe("readMetaChannelCredentials", () => {
  it("returns the credentials object when every required field is present", () => {
    const out = readMetaChannelCredentials({ ...validMeta });
    expect(out.pixelId).toBe("1111111111");
    expect(out.catalogId).toBe("2222222222");
    expect(out.businessId).toBe("3333333333");
    expect(out.accessToken).toBe("EAAFakeSystemUserToken");
    expect(out.testEventCode).toBeUndefined();
  });

  it("preserves testEventCode when set", () => {
    const out = readMetaChannelCredentials({ ...validMeta, testEventCode: "TEST12345" });
    expect(out.testEventCode).toBe("TEST12345");
  });

  it("rejects null", () => {
    expect(() => readMetaChannelCredentials(null)).toThrow("meta_channel_credentials_invalid");
  });

  it("rejects non-object", () => {
    expect(() => readMetaChannelCredentials("string")).toThrow("meta_channel_credentials_invalid");
  });

  it("rejects missing pixelId", () => {
    const { pixelId, ...rest } = validMeta;
    void pixelId;
    expect(() => readMetaChannelCredentials(rest)).toThrow("meta_channel_credentials_invalid");
  });

  it("rejects missing catalogId", () => {
    const { catalogId, ...rest } = validMeta;
    void catalogId;
    expect(() => readMetaChannelCredentials(rest)).toThrow("meta_channel_credentials_invalid");
  });

  it("rejects missing businessId", () => {
    const { businessId, ...rest } = validMeta;
    void businessId;
    expect(() => readMetaChannelCredentials(rest)).toThrow("meta_channel_credentials_invalid");
  });

  it("rejects missing accessToken", () => {
    const { accessToken, ...rest } = validMeta;
    void accessToken;
    expect(() => readMetaChannelCredentials(rest)).toThrow("meta_channel_credentials_invalid");
  });

  it("rejects testEventCode with wrong type", () => {
    expect(() => readMetaChannelCredentials({ ...validMeta, testEventCode: 123 })).toThrow(
      "meta_channel_credentials_invalid",
    );
  });

  it("rejects empty-string testEventCode", () => {
    expect(() => readMetaChannelCredentials({ ...validMeta, testEventCode: "" })).toThrow(
      "meta_channel_credentials_invalid",
    );
  });
});

describe("readTiktokChannelCredentials", () => {
  const VALID = {
    pixelCode: "CXXXXXXXXXXXXXXXXXXXXXXX",
    catalogId: "ttcat_123456",
    accessToken: "ttkn_long_lived_xxx",
  };

  it("accepts a complete blob", () => {
    expect(readTiktokChannelCredentials(VALID)).toEqual(VALID);
  });

  it("rejects non-object input (string)", () => {
    expect(() => readTiktokChannelCredentials("nope")).toThrow(
      "tiktok_channel_credentials_invalid",
    );
  });

  it("rejects null", () => {
    expect(() => readTiktokChannelCredentials(null)).toThrow("tiktok_channel_credentials_invalid");
  });

  it("rejects missing pixelCode", () => {
    const { pixelCode, ...rest } = VALID;
    void pixelCode;
    expect(() => readTiktokChannelCredentials(rest)).toThrow("tiktok_channel_credentials_invalid");
  });

  it("rejects empty-string pixelCode", () => {
    expect(() => readTiktokChannelCredentials({ ...VALID, pixelCode: "" })).toThrow(
      "tiktok_channel_credentials_invalid",
    );
  });

  it("rejects missing catalogId", () => {
    const { catalogId, ...rest } = VALID;
    void catalogId;
    expect(() => readTiktokChannelCredentials(rest)).toThrow("tiktok_channel_credentials_invalid");
  });

  it("rejects missing accessToken", () => {
    const { accessToken, ...rest } = VALID;
    void accessToken;
    expect(() => readTiktokChannelCredentials(rest)).toThrow("tiktok_channel_credentials_invalid");
  });

  it("accepts optional testEventCode when set to a non-empty string", () => {
    const out = readTiktokChannelCredentials({ ...VALID, testEventCode: "TEST123" });
    expect(out.testEventCode).toBe("TEST123");
  });

  it("rejects empty-string testEventCode (would silently send empty header)", () => {
    expect(() => readTiktokChannelCredentials({ ...VALID, testEventCode: "" })).toThrow(
      "tiktok_channel_credentials_invalid",
    );
  });

  it("rejects testEventCode with wrong type (number)", () => {
    expect(() => readTiktokChannelCredentials({ ...VALID, testEventCode: 123 })).toThrow(
      "tiktok_channel_credentials_invalid",
    );
  });
});
