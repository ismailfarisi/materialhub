"use client";

import { Coins } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useShippingContributionTier } from "@/lib/queries/shipping-contribution-tiers";
import { ShippingContributionTierForm } from "../form";

function formatRelativeTime(iso: string): string {
  const delta = Date.now() - new Date(iso).getTime();
  const mins = Math.round(delta / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export default function EditShippingContributionTierPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const { data: tier, isLoading, isError } = useShippingContributionTier(id);

  if (isLoading) {
    return <div className="p-6 text-muted-foreground">Loading…</div>;
  }

  if (isError || !tier) {
    return (
      <div className="p-6">
        <p className="text-destructive mb-2">Contribution band not found.</p>
        <Link href="/settings/shipping-contribution-tiers" className="text-primary hover:underline">
          Back to list
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center gap-3">
        <Coins className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Edit Contribution Band</h1>
          <p className="text-sm text-muted-foreground">
            Last updated {formatRelativeTime(tier.updated_at)}.
          </p>
        </div>
      </div>
      <ShippingContributionTierForm tier={tier} />
    </div>
  );
}
