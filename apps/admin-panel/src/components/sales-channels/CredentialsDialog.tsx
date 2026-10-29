"use client";

import { type ChannelCode, useSetChannelCredentials } from "@/lib/queries/sales-channels";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Textarea,
  toast,
} from "@materialhub/ui";
import { useEffect, useState } from "react";

const PLACEHOLDERS: Record<ChannelCode, string> = {
  google_merchant: JSON.stringify(
    {
      merchantCenter: {
        merchantId: "1234567890",
        serviceAccount: {
          client_email: "materialhub-merchant-feeds@<gcp-project>.iam.gserviceaccount.com",
          private_key: "-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n",
        },
      },
      googleAds: null,
    },
    null,
    2,
  ),
  meta_catalog: JSON.stringify(
    {
      pixelId: "1234567890",
      catalogId: "1234567890",
      businessId: "1234567890",
      accessToken: "EAAxxx...",
    },
    null,
    2,
  ),
  tiktok: JSON.stringify(
    {
      pixelCode: "CXXXXXXXXXXXXXXXXXXXXXXX",
      catalogId: "12345",
      accessToken: "ttkn_...",
    },
    null,
    2,
  ),
};

const RUNBOOK_HINTS: Record<ChannelCode, string> = {
  google_merchant: "Runbook §3 covers the GCP service-account export + nested shape.",
  meta_catalog: "Runbook §17.x covers the Meta System User token + Business Manager linkage.",
  tiktok: "Runbook §20–§22 cover the TikTok Business Center System User token.",
};

export interface CredentialsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channelCode: ChannelCode;
  channelDisplayName: string;
  hasExisting: boolean;
}

export function CredentialsDialog({
  open,
  onOpenChange,
  channelCode,
  channelDisplayName,
  hasExisting,
}: CredentialsDialogProps) {
  const [raw, setRaw] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const mutation = useSetChannelCredentials(channelCode);

  // Reset form when the dialog opens. `mutation` is a new object every render
  // and `mutation.reset()` itself triggers a re-render, so including it in the
  // deps array causes an infinite loop that blanks the page. Depend on `open`
  // alone — the reset is only meaningful on the closed→open transition anyway.
  // biome-ignore lint/correctness/useExhaustiveDependencies: react-query mutation refs are unstable; see comment above
  useEffect(() => {
    if (open) {
      setRaw("");
      setParseError(null);
      mutation.reset();
    }
  }, [open]);

  const onSubmit = () => {
    let parsed: Record<string, unknown>;
    try {
      const candidate = JSON.parse(raw);
      if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
        setParseError("Credentials must be a JSON object.");
        return;
      }
      parsed = candidate as Record<string, unknown>;
    } catch (err) {
      setParseError(`Invalid JSON: ${(err as Error).message}`);
      return;
    }
    setParseError(null);
    mutation.mutate(parsed, {
      onSuccess: () => {
        toast({ title: "Credentials saved" });
        onOpenChange(false);
      },
      onError: (err: unknown) => {
        const apiMsg =
          (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          (err as Error)?.message ??
          "Unknown error";
        toast({ title: "Failed to save credentials", description: apiMsg, variant: "destructive" });
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {hasExisting ? "Replace" : "Set"} credentials for {channelDisplayName}
          </DialogTitle>
          <DialogDescription>
            Paste the credentials JSON. Backend AES-256 encrypts it on save.{" "}
            {RUNBOOK_HINTS[channelCode]}
          </DialogDescription>
        </DialogHeader>

        {hasExisting && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            This channel already has credentials. Saving will replace them — there's no undo.
          </div>
        )}

        <div className="space-y-2">
          <Textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder={PLACEHOLDERS[channelCode]}
            rows={16}
            className="font-mono text-xs"
            spellCheck={false}
            autoComplete="off"
          />
          {parseError && <p className="text-xs text-destructive">{parseError}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={onSubmit}
            disabled={mutation.isPending || raw.trim().length === 0}
            variant={hasExisting ? "destructive" : "default"}
          >
            {mutation.isPending
              ? "Saving…"
              : hasExisting
                ? "Replace credentials"
                : "Save credentials"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
