"use client";

import type { Integration } from "@/lib/integrations/api";
import { CaretRight, Plug } from "@phosphor-icons/react";
import Link from "next/link";
import { PulseDot } from "./PulseDot";
import type { PulseState } from "./PulseDot";

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

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const ageMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ageMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return `${Math.floor(hrs / 24)} d ago`;
}

function maskSecret(last4: string | null): string {
  if (!last4) return "••••••••";
  return `••••${last4}`;
}

// ─── Empty state ──────────────────────────────────────────────────────────────

interface EmptyStateProps {
  onNew: () => void;
}

function EmptyState({ onNew }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-5">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber/10">
        <Plug size={24} className="text-taupe" />
      </div>
      <div className="text-center space-y-1">
        <p className="text-base font-semibold text-cacao">No integrations yet.</p>
        <p className="text-sm text-taupe max-w-xs">
          Connect a partner to start pushing events out or accepting events in.
        </p>
      </div>
      <button
        type="button"
        onClick={onNew}
        className="inline-flex items-center gap-2 rounded-md bg-cacao px-4 py-2 text-xs font-semibold uppercase tracking-wide text-linen transition-opacity hover:opacity-80 duration-200 ease-out"
      >
        + NEW INTEGRATION
      </button>
    </div>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function IntegrationCard({ integration }: { integration: Integration }) {
  const pulseState = pulseStateFromIntegration(integration);
  const lastDelivery = integration.last_outbound_success_at ?? integration.last_inbound_success_at;

  return (
    <Link
      href={`/integrations/${integration.id}`}
      className={[
        "group block rounded-lg border border-pearl/14 bg-linen p-6",
        "transition-all duration-200 ease-out",
        "hover:border-pearl/40 active:scale-[0.98]",
      ].join(" ")}
    >
      {/* Header row */}
      <div className="flex items-center gap-2.5 mb-3">
        <PulseDot state={pulseState} />
        <span className="text-2xl font-semibold text-cacao leading-none">{integration.name}</span>
      </div>

      {/* Amber rule */}
      <div className="h-px w-12 bg-amber mb-5" />

      {/* Inbound URL */}
      <div className="mb-4">
        <p className="text-xs uppercase tracking-wide text-taupe mb-1">Inbound URL</p>
        <p className="font-mono text-sm text-cacao break-all">
          /integrations/inbound/{integration.id}
        </p>
      </div>

      {/* Secrets row */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="rounded-md border border-pearl/14 bg-pearl/30 px-3 py-2">
          <p className="text-xs uppercase tracking-wide text-taupe mb-1">Inbound</p>
          <p className="font-mono text-sm text-cacao">
            {maskSecret(integration.inbound_secret_last4)}
          </p>
        </div>
        <div className="rounded-md border border-pearl/14 bg-pearl/30 px-3 py-2">
          <p className="text-xs uppercase tracking-wide text-taupe mb-1">Outbound</p>
          <p className="font-mono text-sm text-cacao">
            {maskSecret(integration.outbound_secret_last4)}
          </p>
        </div>
      </div>

      {/* Footer row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-taupe">Last delivery</span>
          <span className="text-xs text-cacao/80">{timeAgo(lastDelivery)}</span>
        </div>
        <CaretRight
          size={16}
          className="text-taupe/60 transition-transform duration-200 ease-out group-hover:translate-x-0.5"
        />
      </div>
    </Link>
  );
}

// ─── List ─────────────────────────────────────────────────────────────────────

interface IntegrationsListProps {
  integrations: Integration[];
  onNew: () => void;
}

export function IntegrationsList({ integrations, onNew }: IntegrationsListProps) {
  if (integrations.length === 0) {
    return <EmptyState onNew={onNew} />;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {integrations.map((i) => (
        <IntegrationCard key={i.id} integration={i} />
      ))}
    </div>
  );
}
