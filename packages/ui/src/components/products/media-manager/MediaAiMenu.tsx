"use client";

import { Sparkle, Spinner } from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "../../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../ui/dialog";
import type { ImageMediaItem } from "./types";

interface Props {
  open: boolean;
  item: ImageMediaItem | null;
  onClose: () => void;
  onEnhance: (
    id: string,
  ) => Promise<
    { kind: "candidate"; candidate_id: string; preview_url: string } | { kind: "no_change" }
  >;
  onAccept: (originalId: string, candidate_id: string) => Promise<void>;
  onReject: (originalId: string, candidate_id: string) => Promise<void>;
}

export function MediaAiMenu({ open, item, onClose, onEnhance, onAccept, onReject }: Props) {
  const [phase, setPhase] = useState<"idle" | "running" | "preview" | "noop">("idle");
  const [candidate, setCandidate] = useState<{
    id: string;
    url: string;
  } | null>(null);
  const [slider, setSlider] = useState(50);

  async function run() {
    if (!item) return;
    setPhase("running");
    try {
      const res = await onEnhance(item.id);
      if (res.kind === "no_change") {
        setPhase("noop");
      } else {
        setCandidate({ id: res.candidate_id, url: res.preview_url });
        setPhase("preview");
      }
    } catch {
      setPhase("idle");
    }
  }

  function reset() {
    setPhase("idle");
    setCandidate(null);
    setSlider(50);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkle weight="fill" className="text-amber" /> Enhance with AI
          </DialogTitle>
          <DialogDescription>The original is kept and can be reverted any time.</DialogDescription>
        </DialogHeader>
        {phase === "idle" && item && (
          <>
            <div className="rounded-lg overflow-hidden bg-pearl/40 flex items-center justify-center">
              <img src={item.medium_url ?? item.url} alt="" className="max-h-80 object-contain" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={run}>
                <Sparkle weight="fill" /> Enhance
              </Button>
            </DialogFooter>
          </>
        )}
        {phase === "running" && (
          <div className="py-16 flex flex-col items-center gap-3 text-sm text-taupe">
            <Spinner className="w-8 h-8 animate-spin text-amber" />
            Working… this usually takes about 20 seconds.
          </div>
        )}
        {phase === "noop" && (
          <>
            <p className="py-12 text-center text-sm text-cacao">
              Image already looks good — no enhancement applied.
            </p>
            <DialogFooter>
              <Button
                onClick={() => {
                  reset();
                  onClose();
                }}
              >
                OK
              </Button>
            </DialogFooter>
          </>
        )}
        {phase === "preview" && item && candidate && (
          <>
            <div className="relative aspect-square max-h-96 mx-auto select-none overflow-hidden rounded-lg">
              <img
                src={item.medium_url ?? item.url}
                alt="Original"
                className="absolute inset-0 w-full h-full object-contain"
              />
              <div
                className="absolute inset-y-0 left-0 overflow-hidden"
                style={{ width: `${slider}%` }}
              >
                <img
                  src={candidate.url}
                  alt="Enhanced"
                  className="absolute top-0 left-0 h-full object-contain"
                  style={{ width: `${100 / (slider / 100)}%` }}
                />
              </div>
              <div
                className="absolute inset-y-0 w-0.5 bg-linen shadow"
                style={{ left: `${slider}%` }}
              />
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={slider}
              onChange={(e) => setSlider(Number(e.target.value))}
              className="w-full"
              aria-label="Before/after slider"
            />
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  onReject(item.id, candidate.id).then(() => {
                    reset();
                    onClose();
                  })
                }
              >
                Discard
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setPhase("idle");
                  void run();
                }}
              >
                Try again
              </Button>
              <Button
                onClick={() =>
                  onAccept(item.id, candidate.id).then(() => {
                    reset();
                    onClose();
                  })
                }
              >
                Use this
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
