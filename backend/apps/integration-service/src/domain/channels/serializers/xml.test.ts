import { describe, expect, it } from "bun:test";
import { cdata, escapeXml, stripInvalidXmlChars } from "./xml.ts";

describe("stripInvalidXmlChars", () => {
  it("drops C0 control chars that XML 1.0 forbids", () => {
    expect(stripInvalidXmlChars("abc\x1Ad")).toBe("abcd");
    expect(stripInvalidXmlChars("a\x00b\x0Cc\x1F")).toBe("abc");
  });

  it("keeps tab, newline and carriage return", () => {
    expect(stripInvalidXmlChars("a\tb\nc\rd")).toBe("a\tb\nc\rd");
  });

  it("keeps non-ASCII text intact", () => {
    expect(stripInvalidXmlChars("Crème — عطر 🌹")).toBe("Crème — عطر 🌹");
  });

  it("drops lone surrogates but keeps well-formed pairs", () => {
    expect(stripInvalidXmlChars("a\uD800b")).toBe("ab");
    expect(stripInvalidXmlChars("🌹")).toBe("🌹");
  });
});

describe("cdata", () => {
  // Verbatim from the prod google_merchant feed, which Google rejected with
  // "CData section not finished" at line 65728 col 106 — a raw 0x1A.
  it("strips the control char that broke the prod feed", () => {
    const out = cdata('called “THE MAN Secr"\x1Aa new revolutionary scent');
    expect(out).toBe('<![CDATA[called “THE MAN Secr"a new revolutionary scent]]>');
  });

  it("splits an embedded ]]> so it cannot close the section early", () => {
    expect(cdata("a]]>b")).toBe("<![CDATA[a]]]]><![CDATA[>b]]>");
  });
});

describe("escapeXml", () => {
  it("strips invalid chars as well as escaping markup", () => {
    expect(escapeXml("a\x1A<b>&'\"")).toBe("a&lt;b&gt;&amp;&apos;&quot;");
  });
});
