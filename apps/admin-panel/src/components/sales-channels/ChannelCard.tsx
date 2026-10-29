"use client";

import {
  type ChannelView,
  useChannelDeliveries,
  useChannelRuns,
  useChannelStats,
  usePatchChannelEnabled,
  useRebuildChannel,
} from "@/lib/queries/sales-channels";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from "@materialhub/ui";
import { ChevronDown, ChevronUp, KeyRound, Megaphone, RefreshCw } from "lucide-react";
import { Fragment, useState } from "react";
import { CredentialsDialog } from "./CredentialsDialog";

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso).getTime();
  const diffMs = Date.now() - d;
  const s = Math.floor(diffMs / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function statusPillVariant(status: string | null): "default" | "destructive" | "secondary" {
  if (status === "success") return "default";
  if (status === "failed") return "destructive";
  return "secondary";
}

export function ChannelCard({ channel }: { channel: ChannelView }) {
  const [expanded, setExpanded] = useState(false);
  const [confirmDisableOpen, setConfirmDisableOpen] = useState(false);
  const [credentialsOpen, setCredentialsOpen] = useState(false);

  const statsQ = useChannelStats(channel.code);
  const patchEnabled = usePatchChannelEnabled(channel.code);
  const rebuild = useRebuildChannel(channel.code);
  const runsQ = useChannelRuns(channel.code, expanded);
  const deliveriesQ = useChannelDeliveries(channel.code, expanded);
  const [openRunRow, setOpenRunRow] = useState<string | null>(null);
  const [openDeliveryRow, setOpenDeliveryRow] = useState<string | null>(null);

  const degraded =
    channel.degraded_until && new Date(channel.degraded_until).getTime() > Date.now();

  const onToggle = (next: boolean) => {
    if (!next) {
      setConfirmDisableOpen(true);
      return;
    }
    patchEnabled.mutate(true, {
      onError: () => toast({ title: "Failed to enable channel", variant: "destructive" }),
    });
  };

  const confirmDisable = () => {
    setConfirmDisableOpen(false);
    patchEnabled.mutate(false, {
      onError: () => toast({ title: "Failed to disable channel", variant: "destructive" }),
    });
  };

  const onRebuild = () => {
    rebuild.mutate(undefined, {
      onSuccess: () => toast({ title: "Rebuild queued" }),
      onError: () => toast({ title: "Failed to queue rebuild", variant: "destructive" }),
    });
  };

  return (
    <Card className={channel.is_enabled ? "" : "opacity-60"}>
      {degraded && (
        <div className="bg-destructive text-destructive-foreground px-4 py-2 text-sm">
          Degraded until {new Date(channel.degraded_until!).toISOString()} UTC
          {channel.last_full_feed_status ? ` — ${channel.last_full_feed_status}` : ""}
        </div>
      )}
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Megaphone size={18} />
          {channel.display_name}
        </CardTitle>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {channel.is_enabled ? "enabled" : "disabled"}
          </span>
          <Switch
            checked={channel.is_enabled}
            onCheckedChange={onToggle}
            disabled={patchEnabled.isPending}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid grid-cols-[140px_1fr_auto] items-center gap-2">
          <span className="text-muted-foreground">Last feed run</span>
          <span className="flex items-center gap-2">
            <Badge variant={statusPillVariant(channel.last_full_feed_status)}>
              {channel.last_full_feed_status ?? "—"}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {relativeTime(channel.last_full_feed_at)}
            </span>
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={onRebuild}
            disabled={!channel.is_enabled || rebuild.isPending}
          >
            <RefreshCw size={14} className="mr-1" />
            Rebuild
          </Button>
        </div>

        <div className="grid grid-cols-[140px_1fr] items-center gap-2">
          <span className="text-muted-foreground">24h deliveries</span>
          <span className="text-sm">
            {statsQ.isLoading
              ? "loading…"
              : statsQ.data?.deliveries.pct == null
                ? "—"
                : `${statsQ.data.deliveries.pct}% (${statsQ.data.deliveries.ok}/${
                    statsQ.data.deliveries.ok + statsQ.data.deliveries.fail
                  })`}
          </span>
        </div>

        <div className="grid grid-cols-[140px_1fr_auto] items-center gap-2">
          <span className="text-muted-foreground">Credentials</span>
          <span>{channel.has_credentials ? "✓ set" : "— not set"}</span>
          <Button size="sm" variant="ghost" onClick={() => setCredentialsOpen(true)}>
            <KeyRound size={14} className="mr-1" />
            {channel.has_credentials ? "Replace" : "Set"}
          </Button>
        </div>

        {channel.feed_url && (
          <div className="grid grid-cols-[140px_1fr] items-center gap-2">
            <span className="text-muted-foreground">Feed URL</span>
            <code className="truncate text-xs">{channel.feed_url}</code>
          </div>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-center"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          <span className="ml-1">{expanded ? "Hide" : "Show"} recent runs &amp; deliveries</span>
        </Button>

        {expanded && (
          <div className="mt-4 space-y-6">
            <section>
              <h4 className="mb-2 text-sm font-medium">Recent feed runs (last 10)</h4>
              {runsQ.isLoading ? (
                <p className="text-xs text-muted-foreground">Loading…</p>
              ) : (runsQ.data?.length ?? 0) === 0 ? (
                <p className="text-xs text-muted-foreground">No runs yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Trigger</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Items</TableHead>
                      <TableHead className="text-right">Bytes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {runsQ.data?.map((r) => (
                      <Fragment key={r.id}>
                        <TableRow
                          className={r.status === "failed" ? "cursor-pointer" : ""}
                          onClick={() =>
                            r.status === "failed"
                              ? setOpenRunRow(openRunRow === r.id ? null : r.id)
                              : undefined
                          }
                        >
                          <TableCell className="text-xs">{relativeTime(r.created_at)}</TableCell>
                          <TableCell className="text-xs">{r.trigger}</TableCell>
                          <TableCell>
                            <Badge variant={statusPillVariant(r.status)}>{r.status}</Badge>
                          </TableCell>
                          <TableCell className="text-right text-xs">
                            {r.item_count || "—"}
                          </TableCell>
                          <TableCell className="text-right text-xs">
                            {r.file_size_bytes ? `${Math.round(r.file_size_bytes / 1024)} KB` : "—"}
                          </TableCell>
                        </TableRow>
                        {openRunRow === r.id && r.error_message && (
                          <TableRow>
                            <TableCell colSpan={5} className="bg-muted/40 text-xs">
                              <pre className="whitespace-pre-wrap">{r.error_message}</pre>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    ))}
                  </TableBody>
                </Table>
              )}
            </section>

            <section>
              <h4 className="mb-2 text-sm font-medium">Recent deliveries (last 20)</h4>
              {deliveriesQ.isLoading ? (
                <p className="text-xs text-muted-foreground">Loading…</p>
              ) : (deliveriesQ.data?.length ?? 0) === 0 ? (
                <p className="text-xs text-muted-foreground">No deliveries yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Event</TableHead>
                      <TableHead>Order</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Lat.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deliveriesQ.data?.map((d) => (
                      <Fragment key={d.id}>
                        <TableRow
                          className={d.status === "failed" ? "cursor-pointer" : ""}
                          onClick={() =>
                            d.status === "failed"
                              ? setOpenDeliveryRow(openDeliveryRow === d.id ? null : d.id)
                              : undefined
                          }
                        >
                          <TableCell className="text-xs">{relativeTime(d.created_at)}</TableCell>
                          <TableCell className="text-xs">{d.event_name ?? "—"}</TableCell>
                          <TableCell className="text-xs">
                            {d.order_id ? `#${d.order_id.slice(0, 8)}` : "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant={statusPillVariant(d.status)}>{d.status}</Badge>
                          </TableCell>
                          <TableCell className="text-right text-xs">
                            {d.latency_ms != null ? `${d.latency_ms}ms` : "—"}
                          </TableCell>
                        </TableRow>
                        {openDeliveryRow === d.id && d.error_message && (
                          <TableRow>
                            <TableCell colSpan={5} className="bg-muted/40 text-xs">
                              <pre className="whitespace-pre-wrap">{d.error_message}</pre>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    ))}
                  </TableBody>
                </Table>
              )}
            </section>
          </div>
        )}
      </CardContent>

      <ConfirmDialog
        open={confirmDisableOpen}
        title={`Disable ${channel.display_name}?`}
        description="Feed builds and conversion uploads stop until re-enabled."
        confirmLabel="Disable"
        destructive
        onConfirm={confirmDisable}
        onClose={() => setConfirmDisableOpen(false)}
      />

      <CredentialsDialog
        open={credentialsOpen}
        onOpenChange={setCredentialsOpen}
        channelCode={channel.code}
        channelDisplayName={channel.display_name}
        hasExisting={channel.has_credentials}
      />
    </Card>
  );
}
