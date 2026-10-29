"use client";

import {
  useCreateAffiliateLink,
  useSetAffiliateStatus,
  useVendorAffiliate,
} from "@/lib/queries/affiliates";
import { Button, StatusBadge } from "@materialhub/ui";
import { useParams } from "next/navigation";
import { useState } from "react";

function formatRate(type: string, value: number) {
  if (type === "fixed") return `AED ${(value / 100).toFixed(2)}`;
  return `${value / 100}%`; // value is bps
}

export default function AffiliateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useVendorAffiliate(id);
  const createLink = useCreateAffiliateLink(id);
  const setStatus = useSetAffiliateStatus();
  const [productTargetId, setProductTargetId] = useState("");

  if (isLoading) return <div className="p-6">Loading…</div>;
  if (!data) return <div className="p-6">Affiliate not found.</div>;

  const { affiliate, links } = data;

  function copyLink(slug: string) {
    const origin = window.location.origin;
    navigator.clipboard.writeText(`${origin}/a/${slug}`);
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold font-mono">{affiliate.affiliate_code}</h1>
          <p className="text-sm text-neutral-500">
            {affiliate.invite_email ?? affiliate.user_id ?? "—"} ·{" "}
            {formatRate(affiliate.commission_type, affiliate.commission_value)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={affiliate.status} />
          {affiliate.status === "active" ? (
            <Button
              variant="outline"
              disabled={setStatus.isPending}
              onClick={() => setStatus.mutate({ id, status: "suspended" })}
            >
              Suspend
            </Button>
          ) : affiliate.status === "suspended" ? (
            <Button
              variant="outline"
              disabled={setStatus.isPending}
              onClick={() => setStatus.mutate({ id, status: "active" })}
            >
              Activate
            </Button>
          ) : null}
        </div>
      </div>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Links</h2>
          <div className="flex items-center gap-2">
            <input
              className="border rounded p-2 text-sm"
              placeholder="Product ID (for product link)"
              value={productTargetId}
              onChange={(e) => setProductTargetId(e.target.value)}
            />
            <Button
              variant="outline"
              disabled={createLink.isPending || !productTargetId}
              onClick={() => {
                createLink.mutate(
                  { targetType: "product", targetId: productTargetId },
                  { onSuccess: () => setProductTargetId("") },
                );
              }}
            >
              Create product link
            </Button>
            <Button
              disabled={createLink.isPending}
              onClick={() => createLink.mutate({ targetType: "store" })}
            >
              Create store link
            </Button>
          </div>
        </div>
        <ul className="space-y-2">
          {links.map((l) => (
            <li key={l.id} className="flex items-center justify-between border rounded p-3">
              <div>
                <div className="font-mono text-sm">/a/{l.slug}</div>
                <div className="text-xs text-neutral-500">
                  {l.target_type}
                  {l.target_id ? ` · ${l.target_id}` : ""} · {l.click_count} clicks
                </div>
              </div>
              <Button variant="ghost" onClick={() => copyLink(l.slug)}>
                Copy
              </Button>
            </li>
          ))}
          {links.length === 0 && <li className="text-sm text-neutral-500">No links yet.</li>}
        </ul>
      </section>
    </div>
  );
}
