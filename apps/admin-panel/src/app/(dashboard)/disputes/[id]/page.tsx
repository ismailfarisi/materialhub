"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  StatusBadge,
  Textarea,
  toast,
} from "@materialhub/ui";
import { ArrowLeft, Send, ShoppingCart, StickyNote } from "lucide-react";
import { apiErrorMessage } from "@/lib/business.helpers";
import { formatAedGrouped } from "@/lib/money";
import {
  useAddDisputeMessage,
  useAdminAssignees,
  useAssignDispute,
  useCloseDispute,
  useDispute,
  useEscalateDispute,
  useResolveDispute,
  type DisputeDetail,
  type DisputeMessage,
} from "@/lib/queries/disputes";
import {
  DISPUTE_STATUS_COLORS,
  buildResolvePayload,
  disputeActions,
  disputeCategoryLabel,
  senderLabel,
  type DisputeDecision,
  type DisputeRefundMethod,
} from "@/lib/disputes.helpers";

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-AE", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function failed(title: string) {
  return (err: unknown) =>
    toast({ title, description: apiErrorMessage(err, "Try again."), variant: "destructive" });
}

function MessageBubble({ message }: { message: DisputeMessage }) {
  const fromPlatform = message.sender_role === "admin" || message.sender_role === "super_admin";
  const isNote = message.is_internal;
  const label = isNote ? "Internal note" : senderLabel(message.sender_role);

  return (
    <li className={`flex ${fromPlatform ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[75%]">
        <div
          className={`mb-1 flex items-center gap-2 text-xs text-taupe ${fromPlatform ? "justify-end" : ""}`}
        >
          <span
            className={`inline-flex items-center rounded px-1.5 py-0.5 font-medium ${
              isNote
                ? "bg-caramel/15 text-caramel"
                : message.sender_role === "vendor"
                  ? "bg-pearl/60 text-cacao"
                  : fromPlatform
                    ? "bg-amber/10 text-amber"
                    : "bg-pearl/40 text-taupe"
            }`}
          >
            {label}
          </span>
          <time dateTime={message.created_at} className="tabular-nums">
            {formatDateTime(message.created_at)}
          </time>
        </div>
        <p
          className={`m-0 whitespace-pre-line break-words rounded-xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
            isNote
              ? "border border-caramel/30 bg-caramel/5 text-cacao"
              : fromPlatform
                ? "bg-cacao text-linen"
                : "bg-pearl/40 text-cacao"
          }`}
        >
          {message.message}
        </p>
      </div>
    </li>
  );
}

function Thread({ dispute }: { dispute: DisputeDetail }) {
  const [body, setBody] = useState("");
  const [isNote, setIsNote] = useState(false);
  const { mutate: send, isPending } = useAddDisputeMessage();
  const endRef = useRef<HTMLDivElement>(null);
  const messages = dispute.messages ?? [];
  const { canMessage } = disputeActions(dispute.status);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages.length]);

  function handleSend() {
    const message = body.trim();
    if (!message) return;
    send(
      { id: dispute.id, message, is_internal: isNote },
      { onSuccess: () => setBody(""), onError: failed("Message not sent") },
    );
  }

  return (
    <section
      aria-label="Case thread"
      className="flex min-h-[28rem] flex-1 flex-col overflow-hidden rounded-xl border border-cacao/15 bg-linen"
    >
      <div className="flex-1 overflow-y-auto px-5 py-5">
        <div className="mb-5 rounded-lg bg-pearl/40 px-4 py-3">
          <p className="m-0 mb-1 text-xs font-medium text-taupe">
            Buyer’s complaint · {disputeCategoryLabel(dispute.category)}
          </p>
          <p className="m-0 whitespace-pre-line text-sm leading-relaxed text-cacao">
            {dispute.description}
          </p>
          {dispute.evidence_urls?.length > 0 && (
            <ul className="m-0 mt-2 flex list-none flex-wrap gap-3 p-0 text-sm">
              {dispute.evidence_urls.map((url, i) => (
                <li key={url}>
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-cacao underline decoration-cacao/30 underline-offset-4 hover:decoration-amber"
                  >
                    Evidence {i + 1}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
        {messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-taupe">
            No replies yet. The buyer and the supplier see everything except internal notes.
          </p>
        ) : (
          <ul className="m-0 grid list-none gap-4 p-0">
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
          </ul>
        )}
        <div ref={endRef} />
      </div>

      {canMessage ? (
        <div className="space-y-3 border-t border-cacao/15 p-4">
          <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-taupe">
            <input
              type="checkbox"
              checked={isNote}
              onChange={(e) => setIsNote(e.target.checked)}
              className="h-4 w-4 rounded border-cacao/15 accent-caramel"
            />
            <StickyNote size={14} aria-hidden="true" className={isNote ? "text-caramel" : ""} />
            Internal note (admins only)
          </label>
          <div
            className={`rounded-lg border p-1 ${isNote ? "border-caramel/40 bg-caramel/5" : "border-cacao/15"}`}
          >
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={isNote ? "Add a note for the team…" : "Reply to the buyer and supplier…"}
              aria-label={isNote ? "Internal note" : "Reply"}
              rows={3}
              className="resize-none border-0 bg-transparent shadow-none focus:ring-0"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleSend();
              }}
            />
            <div className="flex items-center justify-between px-2 pb-1">
              <span className="text-xs text-taupe">Ctrl+Enter to send</span>
              <Button size="sm" onClick={handleSend} disabled={isPending || !body.trim()}>
                <Send size={13} className="mr-1.5" aria-hidden="true" />
                {isPending ? "Sending…" : isNote ? "Add note" : "Send reply"}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <p className="m-0 border-t border-cacao/15 px-4 py-3 text-sm text-taupe">
          This case is closed. The thread is read-only.
        </p>
      )}
    </section>
  );
}

function ResolveDialog({
  dispute,
  open,
  onClose,
}: {
  dispute: DisputeDetail;
  open: boolean;
  onClose: () => void;
}) {
  const [decision, setDecision] = useState<DisputeDecision>("buyer");
  const [resolution, setResolution] = useState("");
  const [amountAed, setAmountAed] = useState("");
  const [refundMethod, setRefundMethod] = useState<DisputeRefundMethod>("wallet");
  const [error, setError] = useState<string | null>(null);
  const { mutate: resolve, isPending } = useResolveDispute();
  const cap = dispute.vendor_order_total ?? dispute.order_total;

  function handleSubmit() {
    const built = buildResolvePayload({ decision, resolution, amountAed, refundMethod }, cap);
    if ("error" in built) {
      setError(built.error);
      return;
    }
    setError(null);
    resolve(
      { id: dispute.id, payload: built.payload },
      {
        onSuccess: () => {
          toast({ title: `${dispute.dispute_number} resolved` });
          onClose();
        },
        onError: (err) => setError(apiErrorMessage(err, "The dispute could not be resolved. Try again.")),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Resolve {dispute.dispute_number}</DialogTitle>
          <DialogDescription>
            The buyer and the supplier see your decision. A refund is paid now and the supplier’s
            commission on it is reversed.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium text-cacao">Decision</legend>
            {(
              [
                ["buyer", "In the buyer’s favour"],
                ["seller", "In the supplier’s favour"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex cursor-pointer items-center gap-2 text-sm text-cacao">
                <input
                  type="radio"
                  name="decision"
                  value={value}
                  checked={decision === value}
                  onChange={() => setDecision(value)}
                  className="h-4 w-4 accent-amber"
                />
                {label}
              </label>
            ))}
          </fieldset>

          {decision === "buyer" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="resolve-amount">Refund (AED)</Label>
                <Input
                  id="resolve-amount"
                  inputMode="decimal"
                  value={amountAed}
                  onChange={(e) => setAmountAed(e.target.value)}
                  placeholder="0.00"
                  className="mt-1 tabular-nums"
                />
                {cap != null && (
                  <p className="mt-1 text-xs text-taupe">Up to {formatAedGrouped(cap)}</p>
                )}
              </div>
              <div>
                <Label htmlFor="resolve-method">Refund to</Label>
                <Select
                  value={refundMethod}
                  onValueChange={(v) => setRefundMethod(v as DisputeRefundMethod)}
                >
                  <SelectTrigger id="resolve-method" className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="wallet">MaterialHub wallet</SelectItem>
                    <SelectItem value="original_payment">Original card payment</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="resolve-note">Decision note</Label>
            <Textarea
              id="resolve-note"
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              rows={3}
              placeholder="What you decided and why, e.g. photos show crushed carton corners on arrival."
              className="mt-1"
            />
          </div>

          {error && (
            <p role="alert" className="m-0 text-sm text-russet">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Resolving…" : "Confirm resolution"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CasePanel({ dispute }: { dispute: DisputeDetail }) {
  const actions = disputeActions(dispute.status);
  const { data: admins = [], isLoading: adminsLoading } = useAdminAssignees(actions.canAssign);
  const { mutate: assign, isPending: assigning } = useAssignDispute();
  const { mutate: escalate, isPending: escalating } = useEscalateDispute();
  const { mutate: close, isPending: closing } = useCloseDispute();
  const [resolveOpen, setResolveOpen] = useState(false);

  return (
    <aside className="w-full flex-shrink-0 space-y-4 lg:w-80">
      <div className="space-y-4 rounded-xl border border-cacao/15 bg-linen p-4">
        <h2 className="m-0 text-sm font-semibold text-cacao">Case</h2>
        <div>
          <Label htmlFor="assignee">Assigned to</Label>
          {actions.canAssign ? (
            <Select
              value={dispute.assigned_to ?? ""}
              disabled={assigning || adminsLoading}
              onValueChange={(assignee_id) =>
                assign(
                  { id: dispute.id, assignee_id },
                  {
                    onSuccess: () => toast({ title: "Dispute assigned" }),
                    onError: failed("Could not assign"),
                  },
                )
              }
            >
              <SelectTrigger id="assignee" className="mt-1">
                <SelectValue placeholder={adminsLoading ? "Loading admins…" : "Choose an admin"} />
              </SelectTrigger>
              <SelectContent>
                {admins.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p id="assignee" className="m-0 mt-1 text-sm text-cacao">
              {dispute.assigned_to_name ?? "Unassigned"}
            </p>
          )}
          {dispute.status === "opened" && (
            <p className="m-0 mt-1 text-xs text-taupe">Assigning moves the case to review.</p>
          )}
        </div>

        <div className="grid gap-2">
          {actions.canResolve && (
            <Button onClick={() => setResolveOpen(true)}>Resolve…</Button>
          )}
          {actions.canEscalate && (
            <Button
              variant="outline"
              disabled={escalating}
              onClick={() =>
                escalate(
                  { id: dispute.id },
                  {
                    onSuccess: () => toast({ title: "Dispute escalated" }),
                    onError: failed("Could not escalate"),
                  },
                )
              }
            >
              {escalating ? "Escalating…" : "Escalate"}
            </Button>
          )}
          {actions.canClose && (
            <Button
              variant="outline"
              disabled={closing}
              onClick={() =>
                close(
                  { id: dispute.id },
                  {
                    onSuccess: () => toast({ title: "Dispute closed" }),
                    onError: failed("Could not close"),
                  },
                )
              }
            >
              {closing ? "Closing…" : "Close case"}
            </Button>
          )}
          {dispute.status === "opened" && (
            <p className="m-0 text-xs text-taupe">Assign the case before resolving it.</p>
          )}
        </div>

        {dispute.resolution && (
          <div className="rounded-lg bg-pearl/40 px-3 py-2">
            <p className="m-0 text-xs font-medium text-taupe">Decision</p>
            <p className="m-0 mt-1 whitespace-pre-line text-sm text-cacao">{dispute.resolution}</p>
            {dispute.resolution_amount != null && dispute.resolution_amount > 0 && (
              <p className="m-0 mt-1 text-sm font-medium tabular-nums text-cacao">
                Refunded {formatAedGrouped(dispute.resolution_amount)}
              </p>
            )}
          </div>
        )}
      </div>

      <dl className="m-0 space-y-2 rounded-xl border border-cacao/15 bg-linen p-4 text-sm">
        <div>
          <dt className="text-xs text-taupe">Order</dt>
          <dd className="m-0">
            <Link
              href={`/orders/${dispute.order_id}`}
              className="inline-flex items-center gap-1.5 font-medium text-cacao hover:text-amber"
            >
              <ShoppingCart size={14} aria-hidden="true" />
              {dispute.order_number ? `#${dispute.order_number}` : dispute.order_id.slice(0, 8)}
            </Link>
            {dispute.order_status && (
              <span className="ml-2">
                <StatusBadge status={dispute.order_status} />
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-taupe">Supplier</dt>
          <dd className="m-0 text-cacao">
            <Link href={`/vendors/${dispute.vendor_id}`} className="hover:text-amber">
              {dispute.vendor_name ?? "—"}
            </Link>
            {dispute.vendor_order_number && (
              <span className="ml-2 font-mono text-xs text-taupe">{dispute.vendor_order_number}</span>
            )}
          </dd>
        </div>
        {dispute.vendor_order_total != null && (
          <div>
            <dt className="text-xs text-taupe">Supplier’s share of the order</dt>
            <dd className="m-0 tabular-nums text-cacao">{formatAedGrouped(dispute.vendor_order_total)}</dd>
          </div>
        )}
        <div>
          <dt className="text-xs text-taupe">Buyer</dt>
          <dd className="m-0 text-cacao">
            {dispute.buyer_name ?? "—"}
            {dispute.buyer_email && <span className="block text-xs text-taupe">{dispute.buyer_email}</span>}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-taupe">Opened</dt>
          <dd className="m-0 tabular-nums text-cacao">{formatDateTime(dispute.created_at)}</dd>
        </div>
        {dispute.deadline_at && !dispute.resolved_at && (
          <div>
            <dt className="text-xs text-taupe">Respond by</dt>
            <dd className="m-0 tabular-nums text-cacao">{formatDateTime(dispute.deadline_at)}</dd>
          </div>
        )}
        {dispute.escalated_at && (
          <div>
            <dt className="text-xs text-taupe">Escalated</dt>
            <dd className="m-0 tabular-nums text-cacao">{formatDateTime(dispute.escalated_at)}</dd>
          </div>
        )}
        {dispute.resolved_at && (
          <div>
            <dt className="text-xs text-taupe">Resolved</dt>
            <dd className="m-0 tabular-nums text-cacao">{formatDateTime(dispute.resolved_at)}</dd>
          </div>
        )}
      </dl>

      {resolveOpen && (
        <ResolveDialog dispute={dispute} open={resolveOpen} onClose={() => setResolveOpen(false)} />
      )}
    </aside>
  );
}

export default function DisputeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: dispute, isLoading, isError } = useDispute(id);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64 rounded-lg" />
        <Skeleton className="h-[60vh] w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !dispute) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-taupe">
        <p className="m-0">{isError ? "This dispute could not be loaded." : "Dispute not found."}</p>
        <Link href="/disputes" className="text-sm text-cacao underline underline-offset-4">
          Back to disputes
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link
          href="/disputes"
          className="rounded-lg p-2 text-taupe hover:bg-pearl/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
          aria-label="Back to disputes"
        >
          <ArrowLeft size={18} />
        </Link>
        <div className="min-w-0">
          <h1 className="m-0 flex flex-wrap items-center gap-3 text-xl font-bold text-cacao">
            <span className="font-mono">{dispute.dispute_number}</span>
            <StatusBadge status={dispute.status} colorMap={DISPUTE_STATUS_COLORS} />
          </h1>
          <p className="m-0 text-sm text-taupe">
            {disputeCategoryLabel(dispute.category)} · {dispute.buyer_name ?? "Buyer"} vs{" "}
            {dispute.vendor_name ?? "supplier"}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <Thread dispute={dispute} />
        <CasePanel dispute={dispute} />
      </div>
    </div>
  );
}
