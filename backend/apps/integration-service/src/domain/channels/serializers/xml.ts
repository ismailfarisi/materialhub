/** Shared XML emit helpers for the channel feed serializers.
 *
 *  Product copy reaches us from vendor paste and bulk import, so it can carry
 *  bytes that are legal in UTF-8 but illegal in XML. A parser rejects the whole
 *  document on the first one, so every value must pass through here. */

/** Chars XML 1.0 allows: #x9 #xA #xD, #x20-#xD7FF, #xE000-#xFFFD, #x10000-#x10FFFF.
 *  Everything else (C0 controls, lone surrogates, #xFFFE/#xFFFF) is unrepresentable
 *  — not even as a numeric entity — so the only option is to drop it. The `u` flag
 *  makes well-formed surrogate pairs match as single code points, so real emoji
 *  survive while lone halves do not. */
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching them is the point
const INVALID_XML_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\uD800-\uDFFF\uFFFE\uFFFF]/gu;

export function stripInvalidXmlChars(value: string): string {
  return value.replace(INVALID_XML_CHARS, "");
}

export function escapeXml(value: string): string {
  return stripInvalidXmlChars(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function cdata(value: string): string {
  // Split any embedded `]]>` across two sections so it cannot close ours early.
  const safe = stripInvalidXmlChars(value).replace(/]]>/g, "]]]]><![CDATA[>");
  return `<![CDATA[${safe}]]>`;
}
