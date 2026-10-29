"use client";

import { useState } from "react";

interface Props {
	candidates: string[];
	initialUrl: string;
	onChange: (url: string) => void;
}

export function ThumbnailPicker({ candidates, initialUrl, onChange }: Props) {
	const [selected, setSelected] = useState(initialUrl);
	const uniqueCandidates = Array.from(
		new Set([initialUrl, ...candidates].filter(Boolean)),
	);

	if (uniqueCandidates.length === 0) return null;

	return (
		<div className="space-y-2">
			<div className="text-sm font-medium text-gray-900">Thumbnail</div>
			<div className="flex gap-3 overflow-x-auto pb-1">
				{uniqueCandidates.map((url) => (
					<button
						key={url}
						type="button"
						onClick={() => {
							setSelected(url);
							onChange(url);
						}}
						className={`shrink-0 rounded-md border-2 p-1 ${
							selected === url ? "border-primary" : "border-transparent"
						}`}
					>
						{/* eslint-disable-next-line @next/next/no-img-element */}
						<img
							src={url}
							alt="Thumbnail option"
							className="h-32 w-20 rounded object-cover"
						/>
					</button>
				))}
			</div>
		</div>
	);
}
