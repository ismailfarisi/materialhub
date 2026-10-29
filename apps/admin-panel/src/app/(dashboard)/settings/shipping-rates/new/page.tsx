"use client";

import { Truck } from "lucide-react";
import { ShippingRateForm } from "../form";

export default function NewShippingRatePage() {
  return (
    <div className="p-6">
      <div className="mb-6 flex items-center gap-3">
        <Truck className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">New Shipping Rate</h1>
          <p className="text-sm text-muted-foreground">
            Create a platform-default or vendor-specific rate.
          </p>
        </div>
      </div>
      <ShippingRateForm />
    </div>
  );
}
