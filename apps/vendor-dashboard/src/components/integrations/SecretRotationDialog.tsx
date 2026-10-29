"use client";

import { useRotateSecret } from "@/lib/integrations/hooks";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  toast,
} from "@materialhub/ui";
import { Copy } from "@phosphor-icons/react";
import { useState } from "react";

interface SecretRotationDialogProps {
  id: string;
  direction: "outbound" | "inbound";
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SecretRotationDialog({
  id,
  direction,
  open,
  onOpenChange,
}: SecretRotationDialogProps) {
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const { mutateAsync, isPending } = useRotateSecret(id);

  async function handleRotate() {
    try {
      const result = await mutateAsync(direction);
      setPlaintext(result.plaintext);
    } catch (err) {
      toast({
        title: "Rotation failed",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  function handleCopy() {
    if (!plaintext) return;
    navigator.clipboard.writeText(plaintext).then(() => {
      toast({ title: "Copied to clipboard" });
    });
  }

  function handleClose() {
    setPlaintext(null);
    onOpenChange(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      handleClose();
      return;
    }
    onOpenChange(next);
  }

  const title = direction === "outbound" ? "Rotate outbound secret" : "Rotate inbound secret";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {plaintext === null ? (
          /* Phase 1 — confirm */
          <div className="space-y-4 py-2">
            <div className="rounded-md border border-russet/40 bg-russet/5 px-4 py-3">
              <p className="text-sm text-russet">
                Rotating breaks any partner using the current secret. They'll need the new value to
                continue verifying.
              </p>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose} disabled={isPending}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleRotate}
                disabled={isPending}
              >
                {isPending ? "Rotating…" : "Rotate now"}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          /* Phase 2 — display new secret */
          <div className="space-y-4 py-2">
            <div className="rounded-md border border-russet/40 bg-russet/5 px-4 py-3">
              <p className="text-sm text-russet font-semibold">
                Copy this now. It won't be shown again.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-md border border-pearl/14 bg-pearl/30 px-3 py-2 font-mono text-sm text-cacao break-all">
                {plaintext}
              </code>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCopy}
                className="shrink-0"
              >
                <Copy size={14} className="mr-1" />
                Copy
              </Button>
            </div>

            <DialogFooter>
              <Button type="button" onClick={handleClose}>
                Close
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
