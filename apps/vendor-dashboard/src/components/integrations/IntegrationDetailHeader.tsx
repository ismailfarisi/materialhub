"use client";

import type { Integration } from "@/lib/integrations/api";
import { useIntegration } from "@/lib/integrations/hooks";
import { Skeleton } from "@materialhub/ui";
import { ArrowLeft } from "@phosphor-icons/react";
import axios from "axios";
import Link from "next/link";
import { useEffect, useState } from "react";
import { PulseDot, type PulseState } from "./PulseDot";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pulseStateFromIntegration(i: Integration): PulseState {
  const ts = [i.last_inbound_success_at, i.last_outbound_success_at]
    .filter(Boolean)
    .map((s) => new Date(s as string).getTime())
    .sort((a, b) => b - a)[0];
  if (!ts) return "stale";
  const ageMs = Date.now() - ts;
  if (ageMs < 5 * 60_000) return "live";
  if (ageMs < 24 * 3600_000) return "recent";
  return "stale";
}

function maskSecret(last4: string | null): string {
  if (!last4) return "••••••••";
  return `••••${last4}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface IntegrationDetailHeaderProps {
  id: string;
}

export function IntegrationDetailHeader({ id }: IntegrationDetailHeaderProps) {
  const { data: integration, isLoading, isError, error } = useIntegration(id);
  const [inboundUrl, setInboundUrl] = useState<string>(`/integrations/inbound/${id}`);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setInboundUrl(`${window.location.origin}/integrations/inbound/${id}`);
    }
  }, [id]);

  // 404 handling
  if (isError && axios.isAxiosError(error) && error.response?.status === 404) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <p className="text-sm text-taupe">Integration not found.</p>
        <Link
          href="/integrations"
          className={[
            "inline-flex items-center gap-2 text-xs uppercase tracking-wide",
            "text-cacao transition-opacity hover:opacity-80 duration-200",
          ].join(" ")}
        >
          <ArrowLeft size={14} />
          Back to Integrations
        </Link>
      </div>
    );
  }

  // Other error handling
  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <p className="text-sm text-russet">
          Couldn't load integration.{" "}
          {error instanceof Error ? error.message : "Unknown error"}
        </p>
        <Link
          href="/integrations"
          className={[
            "inline-flex items-center gap-2 text-xs uppercase tracking-wide",
            "text-cacao transition-opacity hover:opacity-80 duration-200",
          ].join(" ")}
        >
          <ArrowLeft size={14} />
          Back to Integrations
        </Link>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-4">
        {/* Back link skeleton */}
        <Skeleton className="h-4 w-32" />

        {/* Title skeleton */}
        <Skeleton className="h-9 w-48" />

        {/* Amber rule skeleton */}
        <Skeleton className="h-px w-12" />

        {/* URLs skeleton */}
        <div className="grid grid-cols-2 gap-12">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-6 w-24" />
        </div>
        <div className="grid grid-cols-2 gap-12">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-5 w-40" />
        </div>

        {/* Secrets skeleton */}
        <div className="mt-6 grid grid-cols-2 gap-12">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-6 w-24" />
        </div>
        <div className="grid grid-cols-2 gap-12">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-20" />
        </div>
      </div>
    );
  }

  if (!integration) {
    return null;
  }

  const pulseState = pulseStateFromIntegration(integration);

  return (
    <div className="mb-8">
      {/* Back link */}
      <Link
        href="/integrations"
        className={[
          "inline-flex items-center gap-2 text-xs uppercase tracking-wide",
          "text-taupe transition-opacity hover:opacity-80 duration-200 mb-2",
        ].join(" ")}
      >
        <ArrowLeft size={14} />
        Back to Integrations
      </Link>

      {/* Title with pulse dot */}
      <div className="flex items-center gap-2.5 mb-2">
        <PulseDot state={pulseState} />
        <h1 className="text-3xl font-semibold text-cacao">{integration.name}</h1>
      </div>

      {/* Amber rule */}
      <div className="h-px w-12 bg-amber mb-6" />

      {/* Inbound and Outbound URLs */}
      <div className="grid grid-cols-2 gap-12 mb-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-taupe mb-1">Inbound URL</p>
          <p className="font-mono text-sm text-cacao break-all">{inboundUrl}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-taupe mb-1">Outbound URL</p>
          <p className="font-mono text-sm text-cacao break-all">
            {integration.outbound_url || "—"}
          </p>
        </div>
      </div>

      {/* Secrets row */}
      <div className="grid grid-cols-2 gap-12 mb-8">
        <div>
          <p className="text-xs uppercase tracking-wide text-taupe mb-1">Inbound Secret</p>
          <p className="font-mono text-sm text-cacao">
            {maskSecret(integration.inbound_secret_last4)}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-taupe mb-1">Outbound Secret</p>
          <p className="font-mono text-sm text-cacao">
            {maskSecret(integration.outbound_secret_last4)}
          </p>
        </div>
      </div>
    </div>
  );
}
