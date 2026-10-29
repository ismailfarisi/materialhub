"use client";

import { useTestFire } from "@/lib/integrations/hooks";
import { OUTBOUND_EVENTS } from "@/lib/integrations/spec-types";
import type { EventType } from "@/lib/integrations/spec-types";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  toast,
} from "@materialhub/ui";
import { Flask } from "@phosphor-icons/react";
import { useState } from "react";

interface TestFireDialogProps {
  integrationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TestFireDialog({ integrationId, open, onOpenChange }: TestFireDialogProps) {
  const [eventType, setEventType] = useState<EventType>(OUTBOUND_EVENTS[0]);
  const [sampleText, setSampleText] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  const { mutateAsync, isPending } = useTestFire(integrationId);

  function validateJson(text: string): Record<string, unknown> | undefined {
    if (!text.trim()) return undefined;
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error("Must be a JSON object");
      }
      return parsed as Record<string, unknown>;
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : "Invalid JSON");
    }
  }

  async function handleSubmit() {
    setJsonError(null);

    let sample_payload: Record<string, unknown> | undefined;
    try {
      sample_payload = validateJson(sampleText);
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : "Invalid JSON");
      return;
    }

    try {
      await mutateAsync({ event_type: eventType, sample_payload });
      toast({ title: "Test fire sent", description: `Dispatched ${eventType}` });
      onOpenChange(false);
      setSampleText("");
    } catch (err: unknown) {
      const resp = (err as { response?: { data?: { error?: string } } }).response?.data;
      if (resp?.error === "NO_OUTBOUND_MAPPING") {
        toast({
          title: "No outbound mapping",
          description: "Configure an outbound mapping for this event first",
        });
      } else {
        toast({
          title: "Test fire failed",
          description: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-pearl text-cacao">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flask size={18} className="text-amber" />
            Test Fire
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-taupe block mb-1.5">Event Type</p>
            <Select value={eventType} onValueChange={(v) => setEventType(v as EventType)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OUTBOUND_EVENTS.map((et) => (
                  <SelectItem key={et} value={et}>
                    <span className="font-mono text-xs">{et}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label
              htmlFor="test-fire-payload"
              className="text-xs uppercase tracking-wide text-taupe block mb-1.5"
            >
              Sample Payload{" "}
              <span className="normal-case tracking-normal text-taupe/70">
                (optional JSON object)
              </span>
            </label>
            <Textarea
              id="test-fire-payload"
              value={sampleText}
              onChange={(e) => {
                setSampleText(e.target.value);
                setJsonError(null);
              }}
              placeholder={'{ "vendor_order": { "status": "shipped" } }'}
              className="font-mono text-xs resize-none h-32 bg-linen border-pearl/28 text-cacao placeholder:text-taupe/50"
            />
            {jsonError && <p className="text-russet text-xs mt-1">{jsonError}</p>}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending}
            className="bg-amber text-cacao hover:bg-amber/90"
          >
            {isPending ? "Firing…" : "Fire"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
