"use client";

import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, ImageOff } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

export interface GalleryImage {
	id: string;
	url: string;
	alt_text?: string;
}

/**
 * Product photos on a white stock card. The main well is a scroll-snap strip,
 * so phones swipe natively; thumbnails and the arrow buttons move it. On
 * pointer devices, hovering the photo zooms in under the cursor so a buyer can
 * read grain, weave and edge finish.
 */
export function MediaGallery({ images }: { images: GalleryImage[] }) {
	const t = useTranslations("pdp");
	const [index, setIndex] = useState(0);
	const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
	const stripRef = useRef<HTMLDivElement>(null);

	const go = useCallback((i: number) => {
		const strip = stripRef.current;
		const slide = strip?.children[i] as HTMLElement | undefined;
		if (!strip || !slide) {
			setIndex(i);
			return;
		}
		// scrollLeft is negative in RTL; offsetLeft relative to the strip works in both.
		strip.scrollTo({ left: slide.offsetLeft - strip.offsetLeft, behavior: "smooth" });
		setIndex(i);
	}, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: re-observe when the slide count changes
	useEffect(() => {
		const strip = stripRef.current;
		if (!strip || typeof IntersectionObserver === "undefined") return;
		const io = new IntersectionObserver(
			(entries) => {
				for (const e of entries) {
					if (e.isIntersecting && e.intersectionRatio > 0.6) {
						setIndex(Number((e.target as HTMLElement).dataset.index));
					}
				}
			},
			{ root: strip, threshold: [0.6] },
		);
		for (const child of Array.from(strip.children)) io.observe(child);
		return () => io.disconnect();
	}, [images.length]);

	if (images.length === 0) {
		return (
			<div className="flex aspect-square flex-col items-center justify-center gap-2 rounded-md bg-nl-pearl text-nl-russet shadow-card">
				<ImageOff className="h-6 w-6" strokeWidth={1.5} aria-hidden="true" />
				<span className="text-[13px]">{t("noImage")}</span>
			</div>
		);
	}

	const many = images.length > 1;

	return (
		<div className="grid gap-3">
			<div className="relative overflow-hidden rounded-md bg-nl-pearl shadow-card">
				<div
					ref={stripRef}
					className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
				>
					{images.map((img, i) => (
						<div
							key={img.id}
							data-index={i}
							className="relative aspect-square w-full shrink-0 snap-start overflow-hidden [@media(hover:hover)]:cursor-zoom-in"
							onMouseMove={(e) => {
								if (!window.matchMedia("(hover: hover)").matches) return;
								const r = e.currentTarget.getBoundingClientRect();
								setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
							}}
							onMouseLeave={() => setZoom(null)}
						>
							<Image
								src={img.url}
								alt={img.alt_text ?? ""}
								fill
								sizes="(min-width: 1024px) 58vw, 100vw"
								priority={i === 0}
								className="object-contain transition-transform duration-200 ease-out motion-reduce:transition-none"
								style={
									zoom && i === index
										? { transform: "scale(2)", transformOrigin: `${zoom.x}% ${zoom.y}%` }
										: undefined
								}
							/>
						</div>
					))}
				</div>

				{many && (
					<>
						<span className="absolute bottom-3 start-3 rounded-sm bg-nl-cacao/80 px-1.5 py-1 font-mono text-[11.5px] leading-none text-white tabular-nums">
							<span className="sr-only">{t("imageCount", { n: index + 1, total: images.length })}</span>
							<span aria-hidden="true" dir="ltr">
								{index + 1} / {images.length}
							</span>
						</span>
						<div className="absolute bottom-3 end-3 flex gap-1.5">
							<button
								type="button"
								onClick={() => go(Math.max(0, index - 1))}
								disabled={index === 0}
								aria-label={t("previousImage")}
								className="flex h-9 w-9 items-center justify-center rounded-md bg-nl-pearl text-nl-cacao shadow-card transition-opacity hover:bg-nl-linen disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-nl-amber"
							>
								<ChevronLeft className="h-4 w-4 rtl:rotate-180" strokeWidth={1.75} aria-hidden="true" />
							</button>
							<button
								type="button"
								onClick={() => go(Math.min(images.length - 1, index + 1))}
								disabled={index === images.length - 1}
								aria-label={t("nextImage")}
								className="flex h-9 w-9 items-center justify-center rounded-md bg-nl-pearl text-nl-cacao shadow-card transition-opacity hover:bg-nl-linen disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-nl-amber"
							>
								<ChevronRight className="h-4 w-4 rtl:rotate-180" strokeWidth={1.75} aria-hidden="true" />
							</button>
						</div>
					</>
				)}
			</div>

			{many && (
				<ul className="m-0 flex list-none gap-2 overflow-x-auto p-0 pb-1 [scrollbar-width:thin]">
					{images.map((img, i) => (
						<li key={img.id} className="shrink-0">
							<button
								type="button"
								onClick={() => go(i)}
								aria-label={t("showImage", { n: i + 1 })}
								aria-current={i === index ? "true" : undefined}
								className={cn(
									"relative block h-16 w-16 overflow-hidden rounded-sm bg-nl-pearl shadow-card",
									"outline outline-2 outline-offset-2 transition-[outline-color] duration-150 focus-visible:outline-nl-amber",
									i === index ? "outline-nl-cacao" : "outline-transparent hover:outline-nl-cacao/30",
								)}
							>
								<Image src={img.url} alt="" fill sizes="64px" className="object-cover" />
							</button>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
