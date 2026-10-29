"use client";

import { CreateIntegrationDialog } from "@/components/integrations/CreateIntegrationDialog";
import { IntegrationsList } from "@/components/integrations/IntegrationsList";
import { useIntegrations } from "@/lib/integrations/hooks";
import { useState } from "react";

export default function IntegrationsPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { data, isLoading, isError } = useIntegrations();

  const integrations = data ?? [];

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-cacao">Integrations</h1>
          <p className="text-sm text-taupe">
            Connect a partner system to push events out, or accept events in.
          </p>
        </div>

        {integrations.length > 0 && (
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="shrink-0 inline-flex items-center gap-2 rounded-md bg-cacao px-4 py-2 text-xs font-semibold uppercase tracking-wide text-linen transition-opacity hover:opacity-80 duration-200 ease-out"
          >
            + NEW INTEGRATION
          </button>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-52 rounded-lg border border-pearl/14 bg-pearl/30 animate-pulse"
            />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-lg border border-pearl/14 bg-pearl/30 px-6 py-10 text-center">
          <p className="text-sm text-russet">
            Could not load integrations. Please refresh and try again.
          </p>
        </div>
      ) : (
        <IntegrationsList integrations={integrations} onNew={() => setDialogOpen(true)} />
      )}

      <CreateIntegrationDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
