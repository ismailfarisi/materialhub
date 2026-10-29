"use client";

export default function IntegrationsIndexPage() {
  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-2xl font-semibold mb-2">Integration pending writes</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Vendor integrations pushing advisory updates queue them here for review. Open a specific
        integration&apos;s pending-writes view from a vendor&apos;s profile, or navigate to a
        specific integration ID below.
      </p>
      <div className="rounded-md border bg-card p-6">
        <p className="text-sm">
          To navigate:{" "}
          <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
            /integrations/{"<integration_id>"}/pending-writes
          </code>
        </p>
      </div>
    </div>
  );
}
