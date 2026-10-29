"use client";

import { ReelsProgramCard } from "@/components/reels/reels-program-card";

export default function ReelsProgramPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reels program</h1>
        <p className="text-sm text-gray-500">
          Opt in to let creators earn commission on sales attributed to their
          reels tagging your products.
        </p>
      </div>
      <ReelsProgramCard />
    </div>
  );
}
