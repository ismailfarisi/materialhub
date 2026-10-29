"use client";

import { useBnplThresholds } from "@/lib/queries/bnpl";
import { formatPrice } from "@/lib/utils";

interface BnplStripProps {
  total_fils: number;
  currency?: string;
  className?: string;
}

export function BnplStrip({ total_fils, currency = "AED", className = "mb-14" }: BnplStripProps) {
  const { data: thresholdsData } = useBnplThresholds();

  // Fallback to a default Tamara threshold if API is offline or database has no records
  const thresholds = thresholdsData && thresholdsData.length > 0
    ? thresholdsData
    : [
        {
          provider: "tamara" as const,
          min_amount_fils: 0, // 0 AED minimum fallback for testing
          max_amount_fils: 10000000, // 100k AED maximum
          plans: [{ installments: 4, interval_days: 30 }],
          surcharge_fils: 0,
        }
      ];

  // Only Tamara is supported.
  const isEligible = (t: { min_amount_fils: number; max_amount_fils: number }) =>
    total_fils >= t.min_amount_fils && total_fils <= t.max_amount_fils;
  const provider = thresholds.find((t) => t.provider === "tamara" && isEligible(t));
  if (!provider) return null;

  const installments = 4;
  const perInstallment = Math.round(total_fils / installments);
  const isTamara = true;

  return (
    <div className={`border border-nl-cacao/20 px-4 py-3.5 flex items-center justify-between gap-4 ${className}`}>
      <div className="text-sm text-nl-cacao">
        Or split in <span className="font-semibold">{installments} payments</span> of{" "}
        <span className="font-semibold">{formatPrice(perInstallment, currency)}</span> — no late
        fees, no interest.
      </div>
      <img
        src="/tamara-logo.png"
        alt="Tamara"
        className="h-7 w-auto object-contain"
        aria-label="Tamara installment plan"
      />
    </div>
  );
}
