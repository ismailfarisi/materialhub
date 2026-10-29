"use client";

import { useEffect } from "react";
import { useRecordView } from "@/lib/queries/account";
import { useAuthStore } from "@/stores/auth";

export function RecordView({ productId }: { productId: string }) {
  const { isAuthenticated } = useAuthStore();
  const recordView = useRecordView();

  useEffect(() => {
    if (isAuthenticated && productId) {
      recordView.mutate(productId);
    }
  }, [productId, isAuthenticated]);

  return null;
}
