"use client";

import { Truck } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useShippingRate } from "@/lib/queries/shipping-rates";
import { ShippingRateForm } from "../form";

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

export default function EditShippingRatePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const { data: rate, isLoading, isError } = useShippingRate(id);

  if (isLoading) {
    return <div className="p-6 text-muted-foreground">Loading…</div>;
  }

  if (isError || !rate) {
    return (
      <div className="p-6">
        <p className="text-destructive mb-2">Shipping rate not found.</p>
        <Link href="/settings/shipping-rates" className="text-primary hover:underline">
          Back to list
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center gap-3">
        <Truck className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Edit Shipping Rate</h1>
          <p className="text-sm text-muted-foreground">
            Last updated {formatRelativeTime(rate.updated_at)}.
          </p>
        </div>
      </div>
      <ShippingRateForm rate={rate} />
    </div>
  );
}
