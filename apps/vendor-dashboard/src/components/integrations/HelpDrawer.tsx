"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@materialhub/ui";
import { useState } from "react";

// ─── Snippets ─────────────────────────────────────────────────────────────────

const SNIPPET_NODE = `const crypto = require('node:crypto');

function verifyMaterialHubSignature(secret, headers, rawBody) {
  const sig = headers['x-signature']; // 'sha256=<hex>'
  const ts = headers['x-timestamp'];
  if (!sig || !ts) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false; // 5min skew
  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(\`\${ts}.\${rawBody}\`)
    .digest('hex');
  // Constant-time compare
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}`;

const SNIPPET_PYTHON = `import hashlib
import hmac
import time

def verify_materialhub_signature(secret: str, headers: dict, raw_body: bytes) -> bool:
    sig = headers.get("X-Signature", "")
    ts = headers.get("X-Timestamp", "")
    if not sig or not ts:
        return False
    if abs(time.time() - int(ts)) > 300:
        return False
    expected = "sha256=" + hmac.new(
        secret.encode("utf-8"),
        f"{ts}.".encode("utf-8") + raw_body,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(sig, expected)`;

const SNIPPET_PHP = `<?php
function verify_materialhub_signature(string $secret, array $headers, string $rawBody): bool {
    $sig = $headers['X-Signature'] ?? '';
    $ts = $headers['X-Timestamp'] ?? '';
    if (!$sig || !$ts) return false;
    if (abs(time() - (int)$ts) > 300) return false;
    $expected = 'sha256=' . hash_hmac('sha256', "$ts.$rawBody", $secret);
    return hash_equals($sig, $expected);
}`;

// ─── Tab definitions ──────────────────────────────────────────────────────────

const TABS = [
  { label: "Node.js", snippet: SNIPPET_NODE },
  { label: "Python", snippet: SNIPPET_PYTHON },
  { label: "PHP", snippet: SNIPPET_PHP },
];

// ─── Headers list ─────────────────────────────────────────────────────────────

const HEADERS = [
  { name: "X-Signature", description: "sha256=<hex>" },
  { name: "X-Timestamp", description: "unix seconds" },
  {
    name: "X-Idempotency-Key",
    description: "unique per delivery; safe to dedupe on",
  },
  { name: "X-Event-Type", description: "e.g. vendor_order.created" },
  { name: "X-Integration-Id", description: "your integration ID" },
];

// ─── Component ────────────────────────────────────────────────────────────────

interface HelpDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function HelpDrawer({ open, onOpenChange }: HelpDrawerProps) {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-cacao">
            How to verify our signature
          </DialogTitle>
        </DialogHeader>

        {/* Intro */}
        <p className="text-sm text-taupe leading-relaxed">
          Every outbound request we send includes an HMAC-SHA256 signature over
          the request timestamp and raw body, signed with your outbound secret.
          Verify the signature before processing the payload — reject anything
          that fails or is more than 5 minutes old.
        </p>

        {/* ── Tab strip ─────────────────────────────────────── */}
        <div className="border-b border-pearl/14">
          {TABS.map((tab, index) => (
            <button
              // biome-ignore lint/suspicious/noArrayIndexKey: stable tab order
              key={index}
              type="button"
              onClick={() => setActiveTab(index)}
              className={[
                "relative inline-block px-4 py-3 text-sm uppercase tracking-wide transition-colors duration-200",
                activeTab === index
                  ? "text-cacao border-b-2 border-amber pb-1"
                  : "text-taupe border-b-2 border-transparent hover:text-cacao",
              ].join(" ")}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Code snippet ──────────────────────────────────── */}
        <pre className="bg-linen rounded-md border border-pearl/14 p-4 font-mono text-xs text-cacao overflow-x-auto leading-relaxed whitespace-pre">
          {TABS[activeTab]?.snippet}
        </pre>

        {/* ── Headers we send ───────────────────────────────── */}
        <div>
          <div className="mb-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-taupe">
              Headers we send
            </p>
            <div className="mt-1 h-px w-6 bg-amber" />
          </div>

          <ul className="space-y-2">
            {HEADERS.map((h) => (
              <li key={h.name} className="flex items-start gap-3">
                <code className="shrink-0 rounded border border-pearl/14 bg-pearl/30 px-2 py-0.5 font-mono text-xs text-cacao">
                  {h.name}
                </code>
                <span className="text-xs text-taupe">{h.description}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* ── Inbound note ──────────────────────────────────── */}
        <p className="text-xs text-taupe border-t border-pearl/14 pt-4 leading-relaxed">
          <span className="font-semibold text-cacao">
            Inbound (vendor → us):
          </span>{" "}
          requests you send to our inbound URL must be signed with your inbound
          secret using the same scheme — include{" "}
          <code className="rounded border border-pearl/14 bg-pearl/30 px-1 font-mono text-xs text-cacao">
            X-Signature
          </code>{" "}
          and{" "}
          <code className="rounded border border-pearl/14 bg-pearl/30 px-1 font-mono text-xs text-cacao">
            X-Timestamp
          </code>
          . The timestamp must be within 5 minutes of our server time.
        </p>
      </DialogContent>
    </Dialog>
  );
}
