"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// Removes the wrapped chrome from the DOM when the user is on a /reels route,
// so the reel feed gets the full viewport. Locale prefix is allowed.
export function HideOnReels({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const isReels = /^\/[a-z]{2}\/reels(\/|$)/.test(pathname) || /^\/reels(\/|$)/.test(pathname);
  if (isReels) return null;
  return <>{children}</>;
}
