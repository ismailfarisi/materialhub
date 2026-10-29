"use client";

import { useState } from "react";

interface Props {
  candidates: string[];
  initialUrl: string;
  onChange: (url: string) => void;
}

export function ThumbnailPicker({ candidates, initialUrl, onChange }: Props) {
  const [selected, setSelected] = useState(initialUrl);
  const uniqueCandidates = Array.from(new Set([initialUrl, ...candidates]));

  return (
    <div>
      <label className="block text-sm font-semibold mb-2">Thumbnail</label>
      <div className="flex gap-2">
        {uniqueCandidates.map((url) => (
          <button
            key={url}
            type="button"
            onClick={() => {
              setSelected(url);
              onChange(url);
            }}
            className={`border-2 rounded ${
              selected === url ? "border-black" : "border-transparent"
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="thumbnail option" className="w-20 h-32 object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}
