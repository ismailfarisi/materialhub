import { describe, expect, test } from "bun:test";
import { isPublicRoute } from "./jwt-auth.ts";

const P = "11111111-1111-4111-8111-111111111111";

describe("isPublicRoute: routes made public after the E2E pass", () => {
  test.each([
    ["GET", `/products/${P}/reviews`],
    ["GET", "/search/trending"],
    ["GET", "/vendor-members/invite/tok_abc"],
    ["POST", "/vendor-members/decline"],
    ["POST", `/integrations/inbound/${P}/order.accept`],
  ])("%s %s is public", (method, path) => {
    expect(isPublicRoute(path, method)).toBe(true);
  });

  test.each([
    ["POST", `/products/${P}/reviews`], // writing a review needs a user
    ["POST", "/vendor-members/accept"], // accepting binds the invite to a user
    ["GET", `/integrations/inbound/${P}/order.accept`],
    ["POST", "/integrations/inbound"],
    ["GET", "/vendor-members/invite/tok/extra"],
  ])("%s %s stays protected", (method, path) => {
    expect(isPublicRoute(path, method)).toBe(false);
  });
});
