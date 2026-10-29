import type { Metadata } from "next";
import { ReelUploadForm } from "@/components/reels/reel-upload-form";

export const metadata: Metadata = {
  title: "Post a Reel",
};

export default function ReelUploadPage() {
  return <ReelUploadForm />;
}
