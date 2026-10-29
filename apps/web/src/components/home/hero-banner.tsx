"use client";

import Autoplay from "embla-carousel-autoplay";
import useEmblaCarousel from "embla-carousel-react";
import { ArrowLeft, ArrowRight, Pause, Play } from "lucide-react";
import { useLocale } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackgroundVideo } from "../layout/background-video";

interface Banner {
	id: string;
	title: string;
	subtitle?: string;
	image_url: string;
	mobile_image_url?: string;
	cta_url?: string;
	focal_point?: { x: number; y: number };
	video_url?: string;
}

interface HeroBannerProps {
	banners: Banner[];
	autoplay?: boolean;
	interval?: number;
}

export function HeroBanner({
	banners,
	autoplay = true,
	interval = 6000,
}: HeroBannerProps) {
	const locale = useLocale();
	const plugins = useMemo(
		() =>
			autoplay
				? [
						Autoplay({
							delay: interval,
							// Hover and keyboard focus pause the rotation, then release it
							// again when the visitor moves away. That resume only happens
							// because `stopOnInteraction` is false — with it set to true the
							// plugin treats the first pointer-enter as permanent, and since
							// the hero is a full-bleed band at the top of the page the
							// cursor crosses it almost immediately, so the carousel would
							// stop for good before the first transition ever fired.
							// WCAG 2.2.2 is satisfied by the explicit toggle below, which
							// outranks this auto-resume — see `suppressedRef`.
							stopOnInteraction: false,
							stopOnMouseEnter: true,
							stopOnFocusIn: true,
						}),
					]
				: [],
		[autoplay, interval],
	);
	const [emblaRef, emblaApi] = useEmblaCarousel(
		{ loop: true, direction: locale === "ar" ? "rtl" : "ltr" },
		plugins,
	);
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [isPlaying, setIsPlaying] = useState(false);
	// "The visitor asked for stillness" — either by pressing pause or via the OS
	// reduced-motion setting. A ref rather than state because the enforcement
	// listener below has to read the current value synchronously, before React
	// has re-rendered, or resuming would race with the toggle that just cleared it.
	const suppressedRef = useRef(false);

	const onSelect = useCallback(() => {
		if (!emblaApi) return;
		setSelectedIndex(emblaApi.selectedScrollSnap());
	}, [emblaApi]);

	useEffect(() => {
		if (!emblaApi) return;
		onSelect();
		emblaApi.on("select", onSelect);
		return () => {
			emblaApi.off("select", onSelect);
		};
	}, [emblaApi, onSelect]);

	// Only the visible slide's video is allowed to exist: BackgroundVideo assigns
	// its own src and calls play() only while `active`, and unloads when that
	// goes false. Embla mounts every slide at once, so without this gate a
	// five-slide hero would start five downloads. Expressing it as a prop rather
	// than a ref-walking effect also means there is no stale-array hazard when
	// `banners` changes identity.

	// Mirror the plugin's real state so the toggle never lies about what it does.
	useEffect(() => {
		if (!emblaApi) return;
		const autoplayPlugin = emblaApi.plugins()?.autoplay;
		if (!autoplayPlugin) return;
		const sync = () => setIsPlaying(autoplayPlugin.isPlaying());
		sync();
		emblaApi.on("autoplay:play", sync);
		emblaApi.on("autoplay:stop", sync);
		emblaApi.on("reInit", sync);
		return () => {
			emblaApi.off("autoplay:play", sync);
			emblaApi.off("autoplay:stop", sync);
			emblaApi.off("reInit", sync);
		};
	}, [emblaApi]);

	// A visitor who asked the OS for less motion never gets an auto-advancing
	// hero. They can still start it by hand with the toggle.
	useEffect(() => {
		if (!emblaApi) return;
		const autoplayPlugin = emblaApi.plugins()?.autoplay;
		if (!autoplayPlugin) return;
		const query = window.matchMedia("(prefers-reduced-motion: reduce)");
		const apply = () => {
			if (!query.matches) return;
			suppressedRef.current = true;
			autoplayPlugin.stop();
		};
		apply();
		query.addEventListener("change", apply);
		return () => {
			query.removeEventListener("change", apply);
		};
	}, [emblaApi]);

	// The plugin restarts itself whenever the pointer leaves or focus moves out.
	// That is what keeps the carousel rotating, but it must not resurrect a
	// rotation the visitor deliberately stopped, so re-stop it on the way back up.
	useEffect(() => {
		if (!emblaApi) return;
		const autoplayPlugin = emblaApi.plugins()?.autoplay;
		if (!autoplayPlugin) return;
		const enforceSuppression = () => {
			if (suppressedRef.current) autoplayPlugin.stop();
		};
		emblaApi.on("autoplay:play", enforceSuppression);
		return () => {
			emblaApi.off("autoplay:play", enforceSuppression);
		};
	}, [emblaApi]);

	const toggleAutoplay = useCallback(() => {
		const autoplayPlugin = emblaApi?.plugins()?.autoplay;
		if (!autoplayPlugin) return;
		if (autoplayPlugin.isPlaying()) {
			suppressedRef.current = true;
			autoplayPlugin.stop();
		} else {
			suppressedRef.current = false;
			autoplayPlugin.play();
		}
	}, [emblaApi]);

	if (!banners.length) return null;

	const total = banners.length;
	const showControls = total > 1;

	return (
		<section
			data-section="hero-carousel"
			data-testid="hero-carousel-section"
			className="relative left-[calc(50%-50vw)] w-screen overflow-hidden bg-nl-cacao rtl:left-auto rtl:right-[calc(50%-50vw)]"
		>
			<div ref={emblaRef} className="overflow-hidden">
				<div className="flex">
					{banners.map((banner, i) => {
						const focalPoint = banner.focal_point;
						const objectPosition =
							focalPoint &&
							typeof focalPoint.x === "number" &&
							typeof focalPoint.y === "number"
								? `${focalPoint.x * 100}% ${focalPoint.y * 100}%`
								: "center";

						const slideInner = (
							<>
								<Image
									src={banner.image_url}
									alt={banner.title}
									fill
									priority={i === 0}
									sizes="100vw"
									className="object-cover hidden md:block"
									style={{ objectPosition }}
								/>
								<Image
									src={banner.mobile_image_url || banner.image_url}
									alt={banner.title}
									fill
									priority={i === 0}
									sizes="100vw"
									className="object-cover md:hidden"
									style={{ objectPosition }}
								/>
								{banner.video_url && (
									<BackgroundVideo
										active={i === selectedIndex}
										src={banner.video_url}
										poster={banner.image_url}
										objectPosition={objectPosition}
									/>
								)}
								<div
									aria-hidden="true"
									className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(26,18,8,0.85)_0%,rgba(26,18,8,0.55)_30%,rgba(26,18,8,0.05)_60%,transparent_100%)]"
								/>
								<div
									aria-hidden="true"
									className="pointer-events-none absolute inset-x-0 bottom-0 h-[140px] bg-gradient-to-t from-nl-espresso/55 to-transparent"
								/>
								<div className="absolute inset-0 max-w-[1400px] mx-auto px-6 md:px-16 flex flex-col justify-center text-nl-linen">
									<div className="max-w-[720px] pb-16 md:pb-20">
										<span className="block w-7 h-px bg-nl-amber mb-4 md:mb-5" />
										<h2 className="font-serif text-[clamp(36px,6.5vw,92px)] leading-[0.98] tracking-[-0.02em] text-nl-linen m-0">
											{banner.title}
										</h2>
										{banner.subtitle && (
											<p className="mt-4 md:mt-5 text-sm md:text-base leading-[1.6] text-nl-linen/90 max-w-[480px]">
												{banner.subtitle}
											</p>
										)}
									</div>
								</div>
							</>
						);

						return (
							<div
								key={banner.id}
								className="flex-[0_0_100%] min-w-0 relative aspect-[16/9] md:aspect-[21/9] min-h-[360px] md:min-h-[440px] max-h-[620px]"
							>
								{banner.cta_url ? (
									<Link
										href={banner.cta_url}
										aria-label={banner.title}
										className="absolute inset-0 block"
									>
										{slideInner}
									</Link>
								) : (
									<div className="absolute inset-0">{slideInner}</div>
								)}
							</div>
						);
					})}
				</div>
			</div>

			{showControls && (
				<div className="absolute left-0 right-0 bottom-0 z-10 pointer-events-none">
					<div className="max-w-[1400px] mx-auto px-6 md:px-12 pb-5 md:pb-7 flex items-center justify-between text-nl-linen/90">
						{/* The visible rule stays 2px; the button around it carries the
						    24px+ hit area WCAG 2.5.8 asks for. */}
						<div className="flex items-center pointer-events-auto">
							{banners.map((b, i) => (
								<button
									key={b.id}
									type="button"
									onClick={() => emblaApi?.scrollTo(i)}
									aria-label={`Go to slide ${i + 1} of ${total}`}
									aria-current={selectedIndex === i ? "true" : undefined}
									className="group/dot flex items-center px-1 py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nl-amber"
								>
									<span
										className={`block h-0.5 transition-[width,background-color] duration-300 ease-[cubic-bezier(0.2,0.7,0.2,1)] motion-reduce:transition-none ${
											selectedIndex === i
												? "w-8 bg-nl-amber"
												: "w-[18px] bg-nl-pearl/35 group-hover/dot:bg-nl-pearl/60"
										}`}
									/>
								</button>
							))}
						</div>

						<div className="flex items-center gap-4 md:gap-5 pointer-events-auto">
							<div className="text-[10px] tracking-[0.3em] uppercase">
								<span className="text-nl-amber">
									{String(selectedIndex + 1).padStart(2, "0")}
								</span>
								<span className="mx-2 opacity-50">/</span>
								<span>{String(total).padStart(2, "0")}</span>
							</div>
							<div className="flex gap-2">
								{autoplay && (
									<button
										type="button"
										onClick={toggleAutoplay}
										aria-label={
											isPlaying
												? "Pause automatic slide rotation"
												: "Resume automatic slide rotation"
										}
										aria-pressed={!isPlaying}
										className="w-10 h-10 border border-nl-pearl/35 bg-nl-espresso/35 backdrop-blur-md text-nl-linen flex items-center justify-center hover:border-nl-amber hover:text-nl-amber transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nl-amber"
									>
										{isPlaying ? (
											<Pause className="h-3.5 w-3.5" strokeWidth={1.25} />
										) : (
											<Play className="h-3.5 w-3.5 rtl:-scale-x-100" strokeWidth={1.25} />
										)}
									</button>
								)}
								<button
									type="button"
									onClick={() => emblaApi?.scrollPrev()}
									aria-label="Previous slide"
									className="w-10 h-10 border border-nl-pearl/35 bg-nl-espresso/35 backdrop-blur-md text-nl-linen flex items-center justify-center hover:border-nl-amber hover:text-nl-amber transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nl-amber"
								>
									<ArrowLeft
										className="h-3.5 w-3.5 rtl:rotate-180"
										strokeWidth={1.25}
									/>
								</button>
								<button
									type="button"
									onClick={() => emblaApi?.scrollNext()}
									aria-label="Next slide"
									className="w-10 h-10 border border-nl-pearl/35 bg-nl-espresso/35 backdrop-blur-md text-nl-linen flex items-center justify-center hover:border-nl-amber hover:text-nl-amber transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nl-amber"
								>
									<ArrowRight
										className="h-3.5 w-3.5 rtl:rotate-180"
										strokeWidth={1.25}
									/>
								</button>
							</div>
						</div>
					</div>
				</div>
			)}
		</section>
	);
}
