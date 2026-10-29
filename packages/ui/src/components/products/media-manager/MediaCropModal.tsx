"use client";

import { useState } from "react";
import Cropper from "react-easy-crop";
import { Button } from "../../ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../../ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../ui/tabs";
import type { CropRect, FocalPoint, ImageMediaItem } from "./types";

interface Props {
  open: boolean;
  item: ImageMediaItem | null;
  onClose: () => void;
  onSave: (crop: CropRect, focal: FocalPoint | null, rotation: number) => Promise<void>;
}

export function MediaCropModal({ open, item, onClose, onSave }: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [aspect, setAspect] = useState<number | undefined>(undefined);
  const [rotation, setRotation] = useState(0);
  const [areaPx, setAreaPx] = useState<CropRect | null>(null);
  const [focal, setFocal] = useState<FocalPoint | null>(null);
  const [saving, setSaving] = useState(false);

  if (!item) return null;

  async function handleSave() {
    if (!item) return;
    setSaving(true);
    try {
      const naturalW = item.width ?? 1;
      const naturalH = item.height ?? 1;
      const normalized: CropRect = areaPx
        ? {
            x: areaPx.x / naturalW,
            y: areaPx.y / naturalH,
            w: areaPx.w / naturalW,
            h: areaPx.h / naturalH,
          }
        : { x: 0, y: 0, w: 1, h: 1 };
      await onSave(normalized, focal, rotation);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit image</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="crop">
          <TabsList>
            <TabsTrigger value="crop">Crop</TabsTrigger>
            <TabsTrigger value="rotate">Rotate</TabsTrigger>
            <TabsTrigger value="focal">Focal point</TabsTrigger>
          </TabsList>
          <TabsContent value="crop">
            <div className="flex gap-2 mb-2">
              <Button
                variant={aspect === undefined ? "default" : "outline"}
                size="sm"
                onClick={() => setAspect(undefined)}
              >
                Free
              </Button>
              <Button
                variant={aspect === 1 ? "default" : "outline"}
                size="sm"
                onClick={() => setAspect(1)}
              >
                1:1
              </Button>
              <Button
                variant={aspect === 4 / 5 ? "default" : "outline"}
                size="sm"
                onClick={() => setAspect(4 / 5)}
              >
                4:5
              </Button>
              <Button
                variant={aspect === 16 / 9 ? "default" : "outline"}
                size="sm"
                onClick={() => setAspect(16 / 9)}
              >
                16:9
              </Button>
            </div>
            <div className="relative h-96 bg-pearl/40 rounded-lg overflow-hidden">
              <Cropper
                image={item.url}
                crop={crop}
                zoom={zoom}
                aspect={aspect}
                rotation={rotation}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_a, areaPixels) => setAreaPx(areaPixels as unknown as CropRect)}
              />
            </div>
          </TabsContent>
          <TabsContent value="rotate">
            <div className="flex gap-2 mb-2">
              <Button variant="outline" size="sm" onClick={() => setRotation((r) => r - 90)}>
                −90°
              </Button>
              <Button variant="outline" size="sm" onClick={() => setRotation((r) => r + 90)}>
                +90°
              </Button>
              <Button variant="outline" size="sm" onClick={() => setRotation(0)}>
                Reset
              </Button>
            </div>
            <input
              type="range"
              min={-15}
              max={15}
              step={0.1}
              value={rotation % 360}
              onChange={(e) => setRotation(Number(e.target.value))}
              className="w-full"
              aria-label="Rotation degrees"
            />
            <p className="text-xs text-taupe text-center">{rotation.toFixed(1)}°</p>
          </TabsContent>
          <TabsContent value="focal">
            <button
              type="button"
              className="relative h-96 w-full bg-pearl/40 rounded-lg overflow-hidden cursor-crosshair"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setFocal({
                  x: (e.clientX - rect.left) / rect.width,
                  y: (e.clientY - rect.top) / rect.height,
                });
              }}
            >
              <img src={item.url} alt="" className="w-full h-full object-contain" />
              {focal && (
                <div
                  className="absolute w-4 h-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-lg bg-amber"
                  style={{
                    left: `${focal.x * 100}%`,
                    top: `${focal.y * 100}%`,
                  }}
                />
              )}
            </button>
            <p className="text-xs text-taupe mt-2">
              Click to set the focal point used by card crops.
            </p>
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
