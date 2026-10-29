"use client";

import {
	FileArrowDown,
	Spinner,
	Trash,
	UploadSimple,
} from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { type S3UploadClient, useS3Upload } from "../../hooks/use-s3-upload";
import { cn } from "../../lib/utils";

export interface S3FileEntry {
	s3_key: string;
	filename: string;
	content_type: string;
}

export interface S3FileFieldProps {
	value: S3FileEntry[];
	onChange: (next: S3FileEntry[]) => void;
	client: S3UploadClient;
	vendorId: string; // required for KYC
	label?: string;
	accept?: string; // default "image/*,.pdf"
	onView?: (entry: S3FileEntry) => Promise<void> | void; // mints signed URL + opens
}

export function S3FileField({
	value,
	onChange,
	client,
	vendorId,
	label,
	accept = "image/*,.pdf",
	onView,
}: S3FileFieldProps) {
	const inputRef = useRef<HTMLInputElement>(null);
	const [error, setError] = useState<string | null>(null);
	const { upload, isUploading } = useS3Upload({
		assetType: "kyc_document",
		client,
		vendorId,
	});

	const handleFiles = async (files: FileList | null) => {
		if (!files) return;
		setError(null);
		const accumulated: S3FileEntry[] = [...value];
		for (const file of Array.from(files)) {
			try {
				const result = await upload(file);
				if (!("key" in result)) {
					throw new Error("Expected a key for KYC upload");
				}
				accumulated.push({
					s3_key: result.key,
					filename: file.name,
					content_type: file.type,
				});
			} catch (e) {
				setError((e as Error).message ?? "Upload failed");
				break;
			}
		}
		onChange(accumulated);
	};

	const remove = (idx: number) => {
		onChange(value.filter((_, i) => i !== idx));
	};

	return (
		<div className="space-y-2">
			{label && <p className="text-sm font-medium">{label}</p>}

			{value.length > 0 && (
				<ul className="space-y-1">
					{value.map((entry, idx) => (
						<li
							key={entry.s3_key}
							className="flex items-center gap-2 rounded border border-stone-200 px-3 py-2 text-sm"
						>
							<FileArrowDown className="w-4 h-4 text-stone-500" />
							<span className="flex-1 truncate">{entry.filename}</span>
							{onView && (
								<button
									type="button"
									onClick={() => onView(entry)}
									className="text-primary hover:underline text-xs"
								>
									View
								</button>
							)}
							<button
								type="button"
								onClick={() => remove(idx)}
								className="text-red-500 hover:text-red-600"
								aria-label="Remove document"
							>
								<Trash className="w-4 h-4" />
							</button>
						</li>
					))}
				</ul>
			)}

			<button
				type="button"
				onClick={() => inputRef.current?.click()}
				disabled={isUploading}
				className={cn(
					"inline-flex items-center gap-2 rounded border-2 border-dashed border-stone-300",
					"px-4 py-2 text-sm text-stone-500 hover:border-stone-400 hover:text-stone-700",
					isUploading && "opacity-60 pointer-events-none",
				)}
			>
				{isUploading ? (
					<Spinner className="w-4 h-4 animate-spin" />
				) : (
					<UploadSimple className="w-4 h-4" />
				)}
				{isUploading ? "Uploading…" : "Add document"}
			</button>

			<input
				ref={inputRef}
				type="file"
				accept={accept}
				multiple
				className="sr-only"
				onChange={(e) => handleFiles(e.target.files)}
			/>

			{error && <p className="text-xs text-red-500">{error}</p>}
		</div>
	);
}
