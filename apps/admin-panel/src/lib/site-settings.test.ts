import { describe, expect, test } from "vitest";
import { serializeSettingInput, settingEditText, settingGroupTabs } from "./site-settings";

describe("site settings", () => {
  test("tabs come from the groups that have settings; groups with their own page are left out", () => {
    const rows = [
      { key: "site_name", value: "MaterialHub", group: "general" },
      { key: "vat_rate", value: "5", group: "tax" },
      { key: "min_order_amount", value: "0", group: "order" },
      { key: "sample_shipping_rate_fils", value: "1500", group: "samples" },
      { key: "slack_support", value: "{}", group: "slack" },
    ];
    expect(settingGroupTabs(rows)).toEqual([
      { key: "general", label: "General" },
      { key: "order", label: "Orders" },
      { key: "tax", label: "Tax" },
    ]);
  });

  test("values go to the API as strings of the right type", () => {
    expect(serializeSettingInput("number", "5.5")).toEqual({ ok: true, value: "5.5" });
    expect(serializeSettingInput("number", "")).toMatchObject({ ok: false });
    expect(serializeSettingInput("integer", "30")).toEqual({ ok: true, value: "30" });
    expect(serializeSettingInput("integer", "3.5")).toMatchObject({ ok: false });
    expect(serializeSettingInput("boolean", "true")).toEqual({ ok: true, value: "true" });
    expect(serializeSettingInput("json", '{ "a": 1 }')).toEqual({ ok: true, value: '{"a":1}' });
    expect(serializeSettingInput("json", "{")).toMatchObject({ ok: false });
  });

  test("json settings open pretty-printed", () => {
    expect(settingEditText({ key: "k", value: '["en","ar"]', value_type: "json" })).toBe('[\n  "en",\n  "ar"\n]');
  });
});
