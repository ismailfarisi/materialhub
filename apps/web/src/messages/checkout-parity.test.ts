import { describe, expect, it } from "vitest";
import ar from "./ar.json";
import en from "./en.json";
import { mergeMessagesWithFallback } from "./fallback";
import hi from "./hi.json";
import ml from "./ml.json";
import ur from "./ur.json";

const localeMessages = { ar, hi, ml, ur };

const checkoutCartKeys = [
  "subtotal",
  "shipping",
  "yourEditOne",
  "yourEditOther",
  "the",
  "bag",
  "close",
] as const;

describe("checkout locale messages", () => {
  it("keeps checkout page translations available in every locale", () => {
    const expectedCheckoutKeys = Object.keys(en.checkout);

    for (const [locale, messages] of Object.entries(localeMessages)) {
      const mergedMessages = mergeMessagesWithFallback(en, messages);
      const missingCheckoutKeys = expectedCheckoutKeys.filter(
        (key) => !(key in mergedMessages.checkout),
      );
      const missingCartKeys = checkoutCartKeys.filter((key) => !(key in mergedMessages.cart));
      const missingCommonKeys = "discount" in mergedMessages.common ? [] : ["discount"];

      expect(
        {
          checkout: missingCheckoutKeys,
          cart: missingCartKeys,
          common: missingCommonKeys,
        },
        locale,
      ).toEqual({
        checkout: [],
        cart: [],
        common: [],
      });
    }
  });
});
