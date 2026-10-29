"use client";

import {
  useAcceptAi,
  useCropImage,
  useDeleteVideo,
  useEnhanceImage,
  usePresignVideo,
  useProcessVideo,
  useProductMedia,
  useRejectAi,
  useReorderMedia,
  useReplaceImage,
  useRevertAi,
  useUpdateImage,
} from "@/lib/queries/media";
import { useDeleteProductImage, useProcessProductImage } from "@/lib/queries/products";
import { s3UploadClient } from "@/lib/s3-upload-client";
import { type MediaActions, MediaManager, useS3Upload } from "@materialhub/ui";

interface Props {
  productId: string;
  variants?: { id: string; name: string }[];
  embedded?: boolean;
}

export function VendorMediaTab({ productId, variants, embedded }: Props) {
  const { data: items = [] } = useProductMedia(productId);
  const { upload, isUploading } = useS3Upload({
    assetType: "product_image",
    client: s3UploadClient,
  });
  const processImage = useProcessProductImage();
  const deleteImage = useDeleteProductImage();
  const reorder = useReorderMedia(productId);
  const updateImg = useUpdateImage(productId);
  const cropImg = useCropImage(productId);
  const replaceImg = useReplaceImage(productId);
  const presignVid = usePresignVideo(productId);
  const processVid = useProcessVideo(productId);
  const delVid = useDeleteVideo(productId);
  const enhance = useEnhanceImage(productId);
  const accept = useAcceptAi(productId);
  const reject = useRejectAi(productId);
  const revert = useRevertAi(productId);

  const actions: MediaActions = {
    upload: async (files) => {
      for (const f of files) {
        if (f.type.startsWith("image/")) {
          const result = await upload(f);
          if (!("key" in result)) throw new Error("Expected key for image upload");
          await processImage.mutateAsync({
            productId,
            key: result.key,
            isPrimary: items.length === 0,
          });
        } else if (f.type.startsWith("video/")) {
          const { url, key } = await presignVid.mutateAsync({
            filename: f.name,
            content_type: f.type,
            size_bytes: f.size,
          });
          const put = await fetch(url, {
            method: "PUT",
            body: f,
            headers: { "Content-Type": f.type },
          });
          if (!put.ok) throw new Error("Upload failed");
          await processVid.mutateAsync(key);
        }
      }
    },
    reorder: async (entries) => {
      await reorder.mutateAsync(entries);
    },
    remove: async (entries) => {
      for (const e of entries) {
        if (e.kind === "image") {
          await deleteImage.mutateAsync({ productId, imageId: e.id });
        } else {
          await delVid.mutateAsync(e.id);
        }
      }
    },
    updateAlt: async (id, alt_text) => {
      await updateImg.mutateAsync({ imageId: id, alt_text });
    },
    updateCrop: async (id, crop, focal, rotation) => {
      await cropImg.mutateAsync({ imageId: id, crop, rotation_degrees: rotation });
      if (focal) {
        await updateImg.mutateAsync({ imageId: id, focal_x: focal.x, focal_y: focal.y });
      }
    },
    replace: async (id, file) => {
      const result = await upload(file);
      if (!("key" in result)) throw new Error("Expected key");
      await replaceImg.mutateAsync({ imageId: id, key: result.key });
    },
    assignVariant: async (entry, variant_id) => {
      if (entry.kind === "image") {
        await updateImg.mutateAsync({ imageId: entry.id, variant_id });
      }
    },
    enhanceAi: async (id) => {
      const res = await enhance.mutateAsync(id);
      if (res.no_change_detected) return { kind: "no_change" };
      return {
        kind: "candidate",
        candidate_id: res.candidate_id ?? "",
        preview_url: res.preview_url ?? "",
      };
    },
    acceptAi: async (id, candidate_id) => {
      await accept.mutateAsync({ imageId: id, candidate_id });
    },
    rejectAi: async (id, candidate_id) => {
      await reject.mutateAsync({ imageId: id, candidate_id });
    },
    revertAi: async (id) => {
      await revert.mutateAsync(id);
    },
  };

  const inner = (
    <MediaManager
      items={items}
      variants={variants}
      isUploading={isUploading || presignVid.isPending || processVid.isPending}
      maxItems={20}
      actions={actions}
    />
  );

  if (embedded) return inner;
  return <div className="p-4">{inner}</div>;
}
