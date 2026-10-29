"use client";

import { Coins } from "lucide-react";
import { ShippingContributionTierForm } from "../form";

export default function NewShippingContributionTierPage() {
  return (
    <div className="p-6">
      <div className="mb-6 flex items-center gap-3">
        <Coins className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">New Contribution Band</h1>
          <p className="text-sm text-muted-foreground">
            Create a platform-default or vendor-specific shipping contribution band.
          </p>
        </div>
      </div>
      <ShippingContributionTierForm />
    </div>
  );
}
