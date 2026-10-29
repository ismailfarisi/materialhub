"use client";

import { useState, useRef, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Textarea,
  Button,
  Skeleton,
  StatusBadge,
} from "@materialhub/ui";
import { useTicket, useUpdateTicket, useAddMessage } from "@/lib/queries/support";
import { ArrowLeft, Send, StickyNote, User, ShoppingCart } from "lucide-react";
import { useRouter } from "next/navigation";

interface Message {
  id: string;
  // Backend SupportMessage columns (no joined sender relation).
  message: string;
  is_internal: boolean;
  sender_id?: string | null;
  sender_role?: string;
  created_at: string;
}

interface Ticket {
  id: string;
  ticket_number: string;
  subject: string;
  status: string;
  priority: string;
  // Flat columns + selectively-joined relations (id/email/name only).
  assigned_to?: string | null;
  assignedToUser?: { id?: string; email?: string; first_name?: string; last_name?: string } | null;
  order_id?: string | null;
  order?: { id?: string; order_number?: string } | null;
  user_id?: string | null;
  user?: { id?: string; email?: string; first_name?: string; last_name?: string } | null;
  guest_email?: string | null;
  guest_name?: string | null;
  messages?: Message[];
  created_at: string;
  updated_at: string;
}

function personName(
  p?: { email?: string; first_name?: string; last_name?: string } | null,
): string | null {
  if (!p) return null;
  return `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || p.email || null;
}

const STATUS_OPTIONS = [
  { label: "Open", value: "open" },
  { label: "In Progress", value: "in_progress" },
  { label: "Waiting Customer", value: "waiting_customer" },
  { label: "Resolved", value: "resolved" },
  { label: "Closed", value: "closed" },
];

const PRIORITY_OPTIONS = [
  { label: "Low", value: "low" },
  { label: "Normal", value: "normal" },
  { label: "High", value: "high" },
  { label: "Urgent", value: "urgent" },
];

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-AE", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MessageBubble({ message }: { message: Message }) {
  const isAgent =
    message.sender_role === "admin" || message.sender_role === "super_admin";
  const isNote = message.is_internal;
  const roleLabel = message.sender_role
    ? message.sender_role.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "Customer";
  const senderName = roleLabel;

  return (
    <div className={`flex ${isAgent || isNote ? "justify-end" : "justify-start"} mb-4`}>
      <div className={`max-w-[70%] ${!isAgent && !isNote ? "order-2" : ""}`}>
        <div className="flex items-center gap-2 mb-1 text-xs text-taupe">
          {!isAgent && !isNote && (
            <span className="inline-flex items-center gap-1">
              <User size={11} />
              {senderName}
            </span>
          )}
          {(isAgent || isNote) && (
            <span className="ml-auto">{senderName}</span>
          )}
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
              isNote
                ? "bg-amber-100 text-amber-700"
                : isAgent
                ? "bg-blue-50 text-amber"
                : "bg-pearl/100 text-taupe"
            }`}
          >
            {isNote ? "Internal Note" : roleLabel}
          </span>
          <span>{formatDateTime(message.created_at)}</span>
        </div>
        <div
          className={`rounded-xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
            isNote
              ? "bg-amber-50 border border-amber-200 text-amber-900"
              : isAgent
              ? "bg-blue-600 text-white"
              : "bg-pearl/100 text-cacao"
          }`}
        >
          {message.message}
        </div>
      </div>
    </div>
  );
}

export default function SupportTicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: ticket, isLoading } = useTicket(id);
  const { mutate: updateTicket, isPending: updatingTicket } = useUpdateTicket();
  const { mutate: addMessage, isPending: sending } = useAddMessage();

  const [messageBody, setMessageBody] = useState("");
  const [isNote, setIsNote] = useState(false);
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [hydrated, setHydrated] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const t: Ticket | null = ticket ?? null;
  const messages: Message[] = t?.messages ?? [];

  useEffect(() => {
    if (t && !hydrated) {
      setStatus(t.status ?? "open");
      setPriority(t.priority ?? "normal");
      setAssignedTo(t.assigned_to ?? "");
      setHydrated(true);
    }
  }, [t, hydrated]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  function handleSend() {
    if (!messageBody.trim()) return;
    addMessage(
      { id, payload: { message: messageBody.trim(), is_internal: isNote } },
      { onSuccess: () => setMessageBody("") }
    );
  }

  function handleUpdateField(field: "status" | "priority", value: string) {
    if (field === "status") setStatus(value);
    if (field === "priority") setPriority(value);
    updateTicket({ id, payload: { [field]: value } });
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64 rounded-lg" />
        <Skeleton className="h-[60vh] w-full rounded-xl" />
      </div>
    );
  }

  if (!t) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-taupe">
        <p>Ticket not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 h-[calc(100vh-8rem)] flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <button
          onClick={() => router.back()}
          className="p-2 rounded-lg hover:bg-pearl/100 text-taupe"
          aria-label="Back"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-cacao">
            Ticket{" "}
            <span className="font-mono text-amber">{t.ticket_number}</span>
          </h1>
          <p className="text-taupe text-sm line-clamp-1">{t.subject}</p>
        </div>
      </div>

      {/* Body: chat + sidebar */}
      <div className="flex gap-5 flex-1 min-h-0">
        {/* Chat panel (2/3) */}
        <div className="flex flex-col flex-1 rounded-xl border border-gray-200 bg-linen overflow-hidden">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-5 py-5">
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-full text-taupe text-sm">
                No messages yet.
              </div>
            ) : (
              messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Message input */}
          <div className="border-t border-gray-100 p-4 space-y-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsNote((n) => !n)}
                className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                  isNote ? "bg-amber-400" : "bg-pearl/200"
                }`}
                role="switch"
                aria-checked={isNote}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-linen shadow transition duration-200 ${
                    isNote ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
              <span className="text-sm text-taupe flex items-center gap-1.5">
                <StickyNote size={13} className={isNote ? "text-amber-500" : "text-taupe"} />
                {isNote ? "Internal Note" : "Reply to customer"}
              </span>
            </div>

            <div
              className={`rounded-lg border p-1 transition-colors ${
                isNote ? "border-amber-300 bg-amber-50" : "border-gray-200"
              }`}
            >
              <Textarea
                value={messageBody}
                onChange={(e) => setMessageBody(e.target.value)}
                placeholder={isNote ? "Add an internal note…" : "Type a reply…"}
                rows={3}
                className="resize-none border-0 shadow-none focus:ring-0 bg-transparent"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleSend();
                }}
              />
              <div className="flex justify-end px-2 pb-1">
                <Button
                  size="sm"
                  onClick={handleSend}
                  disabled={sending || !messageBody.trim()}
                  className={isNote ? "bg-amber-500 hover:bg-amber-600" : ""}
                >
                  <Send size={13} className="mr-1.5" />
                  {sending ? "Sending…" : isNote ? "Add Note" : "Send"}
                </Button>
              </div>
            </div>
            <p className="text-xs text-taupe">Ctrl+Enter to send quickly</p>
          </div>
        </div>

        {/* Sidebar (1/3) */}
        <div className="w-72 flex-shrink-0 space-y-4 overflow-y-auto">
          {/* Status & Priority */}
          <div className="rounded-xl border border-gray-200 bg-linen p-4 space-y-4">
            <h3 className="text-xs font-semibold text-taupe uppercase tracking-wide">Ticket Info</h3>

            <div>
              <label className="block text-sm font-medium text-cacao mb-1">Status</label>
              <Select value={status} onValueChange={(v) => handleUpdateField("status", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium text-cacao mb-1">Priority</label>
              <Select value={priority} onValueChange={(v) => handleUpdateField("priority", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium text-cacao mb-1">Assigned To</label>
              <input
                className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                onBlur={() => {
                  updateTicket({ id, payload: { assigned_to: assignedTo || undefined } });
                }}
                placeholder="Assign to agent…"
              />
            </div>
          </div>

          {/* Linked order */}
          {t.order_id && (
            <div className="rounded-xl border border-gray-200 bg-linen p-4 space-y-2">
              <h3 className="text-xs font-semibold text-taupe uppercase tracking-wide">Linked Order</h3>
              <Link
                href={`/orders/${t.order_id}`}
                className="flex items-center gap-2 text-amber hover:text-amber text-sm font-medium"
              >
                <ShoppingCart size={14} />
                {t.order?.order_number ?? `Order #${t.order_id.slice(0, 8)}`}
              </Link>
            </div>
          )}

          {/* Customer info */}
          <div className="rounded-xl border border-gray-200 bg-linen p-4 space-y-2">
            <h3 className="text-xs font-semibold text-taupe uppercase tracking-wide">Customer</h3>
            {t.user ? (
              <div className="space-y-1">
                <p className="text-sm font-medium text-cacao">{personName(t.user) ?? "—"}</p>
                {t.user.email && <p className="text-sm text-taupe">{t.user.email}</p>}
              </div>
            ) : t.guest_email || t.guest_name ? (
              <div className="space-y-1">
                <p className="text-sm font-medium text-cacao">{t.guest_name ?? "Guest"}</p>
                {t.guest_email && <p className="text-sm text-taupe">{t.guest_email}</p>}
                <span className="inline-block text-xs text-taupe/70">Guest (not signed in)</span>
              </div>
            ) : t.user_id ? (
              <div className="space-y-1">
                <p className="text-sm font-medium text-cacao">Registered customer</p>
                <p className="text-xs text-taupe font-mono">{t.user_id}</p>
              </div>
            ) : (
              <p className="text-sm text-taupe">No customer linked.</p>
            )}
          </div>

          {/* Timestamps */}
          <div className="rounded-xl border border-gray-200 bg-linen p-4 space-y-2">
            <h3 className="text-xs font-semibold text-taupe uppercase tracking-wide">Timestamps</h3>
            <div className="space-y-1 text-sm text-taupe">
              <div className="flex justify-between">
                <span className="text-taupe">Created</span>
                <span>{formatDateTime(t.created_at)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-taupe">Updated</span>
                <span>{formatDateTime(t.updated_at)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
