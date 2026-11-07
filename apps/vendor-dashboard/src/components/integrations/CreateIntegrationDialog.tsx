"use client";

import type { CreateIntegrationResult } from "@/lib/integrations/api";
import { useCreateIntegration } from "@/lib/integrations/hooks";
import { inboundIntegrationUrl } from "@/lib/urls";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  toast,
} from "@materialhub/ui";
import { zodResolver } from "@hookform/resolvers/zod";
import { Copy } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

// ─── Schema ───────────────────────────────────────────────────────────────────

const createSchema = z.object({
  name: z.string().min(1, "Name is required.").max(255, "Name must be 255 characters or fewer."),
  outbound_url: z
    .string()
    .optional()
    .refine((v) => !v || /^https:\/\/.+/.test(v), "Outbound URL must start with https://."),
});

type CreateFields = z.infer<typeof createSchema>;

// ─── Copy row helper ──────────────────────────────────────────────────────────

function CopyRow({ label, value }: { label: string; value: string }) {
  function handleCopy() {
    navigator.clipboard.writeText(value).then(() => {
      toast({ title: "Copied to clipboard" });
    });
  }

  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-taupe mb-1">{label}</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 rounded-md border border-pearl/14 bg-pearl/30 px-3 py-2 font-mono text-sm text-cacao break-all">
          {value}
        </code>
        <Button type="button" variant="outline" size="sm" onClick={handleCopy} className="shrink-0">
          <Copy size={14} className="mr-1" />
          COPY
        </Button>
      </div>
    </div>
  );
}

// ─── Create form ──────────────────────────────────────────────────────────────

interface CreateFormProps {
  onSuccess: (result: CreateIntegrationResult) => void;
  onCancel: () => void;
}

function CreateForm({ onSuccess, onCancel }: CreateFormProps) {
  const { mutateAsync, isPending } = useCreateIntegration();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateFields>({
    resolver: zodResolver(createSchema),
  });

  async function onSubmit(values: CreateFields) {
    const result = await mutateAsync({
      name: values.name,
      outbound_url: values.outbound_url || undefined,
    });
    onSuccess(result);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div className="space-y-5 py-2">
        {/* Name */}
        <div className="space-y-1.5">
          <Label htmlFor="int-name" className="text-sm font-medium text-cacao">
            Name <span className="text-russet">*</span>
          </Label>
          <Input
            id="int-name"
            placeholder="e.g. Acme Fulfillment"
            autoFocus
            {...register("name")}
          />
          {errors.name && <p className="text-xs text-russet">{errors.name.message}</p>}
        </div>

        {/* Outbound URL */}
        <div className="space-y-1.5">
          <Label htmlFor="int-url" className="text-sm font-medium text-cacao">
            Outbound webhook URL
          </Label>
          <Input
            id="int-url"
            placeholder="https://partner.example.com/webhooks/materialhub"
            {...register("outbound_url")}
          />
          {errors.outbound_url ? (
            <p className="text-xs text-russet">{errors.outbound_url.message}</p>
          ) : (
            <p className="text-xs text-taupe">
              Where events will be pushed (https only). Leave blank if you only need to receive.
            </p>
          )}
        </div>
      </div>

      <DialogFooter className="pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Creating…" : "Create integration"}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ─── Secrets panel ───────────────────────────────────────────────────────────

interface SecretsPanelProps {
  result: CreateIntegrationResult;
  onDone: () => void;
}

function SecretsPanel({ result, onDone }: SecretsPanelProps) {
  const router = useRouter();

  function handleContinue() {
    onDone();
    router.push(`/integrations/${result.id}`);
  }

  return (
    <div className="space-y-5 py-2">
      {/* Warning */}
      <div className="rounded-md border border-russet/40 bg-russet/5 px-4 py-3">
        <p className="text-sm font-semibold text-russet">
          These plaintext values appear only once. Copy them before closing.
        </p>
      </div>

      <CopyRow label="Inbound URL" value={inboundIntegrationUrl(result.id)} />
      <CopyRow label="Inbound secret" value={result.inbound_secret_plaintext} />
      <CopyRow label="Outbound secret" value={result.outbound_secret_plaintext} />

      <DialogFooter className="pt-2">
        <Button type="button" onClick={handleContinue}>
          Continue to integration
        </Button>
      </DialogFooter>
    </div>
  );
}

// ─── Dialog ───────────────────────────────────────────────────────────────────

interface CreateIntegrationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateIntegrationDialog({ open, onOpenChange }: CreateIntegrationDialogProps) {
  const [created, setCreated] = useState<CreateIntegrationResult | null>(null);

  function handleClose() {
    // Only allow closing from secrets panel via the "Continue" button,
    // or from the form via Cancel. Once secrets are shown, don't auto-close.
    if (!created) {
      onOpenChange(false);
    }
  }

  function handleDone() {
    setCreated(null);
    onOpenChange(false);
  }

  // Reset state when dialog re-opens
  function handleOpenChange(next: boolean) {
    if (!next && created) {
      // Don't close mid-secrets unless user explicitly clicks Continue
      return;
    }
    if (!next) {
      setCreated(null);
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {created ? "Integration created — copy these now" : "New integration"}
          </DialogTitle>
        </DialogHeader>

        {created ? (
          <SecretsPanel result={created} onDone={handleDone} />
        ) : (
          <CreateForm onSuccess={setCreated} onCancel={handleClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}
