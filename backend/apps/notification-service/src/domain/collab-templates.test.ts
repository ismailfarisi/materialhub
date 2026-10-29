import { describe, expect, it } from "bun:test";
import { getTemplate } from "./templates.ts";

/**
 * `collab_invited` is the first template whose variables are entirely
 * vendor-authored free text (a brand name, an opportunity title they wrote,
 * and a note they typed for one creator). renderHtmlEmail interpolates the
 * rendered body straight into the email HTML with no escaping of its own, so
 * the escaping has to happen here.
 */
function render(variables: Record<string, string>) {
  const template = getTemplate("collab_invited");
  if (!template?.render) throw new Error("collab_invited must render via its own hook");
  return template.render(variables, {});
}

describe("collab_invited template", () => {
  it("names the brand and the opportunity", () => {
    const { title, body } = render({
      vendor_name: "Laura Mercier",
      opportunity_title: "Summer glow",
      invite_note: "",
    });
    expect(title).toBe("Collab Invitation");
    expect(body).toBe("Laura Mercier invited you to Summer glow");
  });

  it("quotes the vendor's note when there is one", () => {
    const { body } = render({
      vendor_name: "Laura Mercier",
      opportunity_title: "Summer glow",
      invite_note: "Loved your last reel",
    });
    expect(body).toBe("Laura Mercier invited you to Summer glow — “Loved your last reel”");
  });

  it("leaves out the quotes entirely for a blank or whitespace-only note", () => {
    // A `{note}` placeholder would render as an empty pair of quotes here.
    for (const invite_note of ["", "   "]) {
      const { body } = render({
        vendor_name: "Laura Mercier",
        opportunity_title: "Summer glow",
        invite_note,
      });
      expect(body).toBe("Laura Mercier invited you to Summer glow");
    }
  });

  it("escapes markup in every vendor-authored value", () => {
    const { body } = render({
      vendor_name: "<script>alert(1)</script>",
      opportunity_title: "Glow & Go",
      invite_note: '<img src=x onerror="alert(1)">',
    });
    expect(body).not.toContain("<script>");
    expect(body).not.toContain("<img");
    expect(body).toContain("&lt;script&gt;");
    expect(body).toContain("Glow &amp; Go");
  });

  it("falls back to a generic brand name when the lookup came back empty", () => {
    // invite() returns "" rather than failing an already-committed invite.
    const { body } = render({ vendor_name: "", opportunity_title: "", invite_note: "" });
    expect(body).toBe("A brand invited you to a collaboration");
  });

  it("links to the creator's own collabs tab", () => {
    expect(getTemplate("collab_invited")?.actionUrlTemplate).toBe("/account/creator?tab=mine");
  });
});
