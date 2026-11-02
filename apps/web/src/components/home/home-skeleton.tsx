/**
 * Placeholder shapes for the CMS sections while the home layout resolves.
 * The category-stock row is real (it needs no API), so buyers can navigate
 * before the hero arrives; the page passes it in as `children`.
 */
import type { ReactNode } from "react";

function Block({ className }: { className: string }) {
	return (
		<span
			aria-hidden="true"
			className={`block rounded-md bg-nl-cacao/[0.07] ${className}`}
		/>
	);
}

export function HomeSkeleton({
	children,
	label,
}: { children?: ReactNode; label: string }) {
	return (
		<div aria-busy="true" className="space-y-10 md:space-y-16">
			<output className="sr-only">
				{label}
			</output>
			<div className="motion-safe:animate-pulse relative left-[calc(50%-50vw)] w-screen rtl:left-auto rtl:right-[calc(50%-50vw)] bg-nl-cacao/[0.08] aspect-[16/9] md:aspect-[21/9] min-h-[360px] md:min-h-[420px] max-h-[min(560px,64vh)]">
				<div className="absolute inset-0 max-w-[1400px] mx-auto px-6 md:px-8 flex flex-col justify-center gap-4">
					<Block className="h-10 md:h-16 w-[70%] max-w-[560px]" />
					<Block className="h-10 md:h-16 w-[45%] max-w-[380px]" />
					<Block className="mt-4 h-12 w-36" />
				</div>
			</div>
			{children}
			<div className="motion-safe:animate-pulse max-w-[1400px] mx-auto px-4 md:px-8 grid gap-6">
				<Block className="h-8 w-56" />
				<div className="flex gap-3 md:gap-4 overflow-hidden">
					{[0, 1, 2, 3, 4].map((i) => (
						<span
							key={i}
							aria-hidden="true"
							className="flex-none w-[200px] md:w-[264px] rounded-md bg-nl-pearl shadow-card overflow-hidden"
						>
							<span className="block h-7 bg-nl-cacao/[0.12]" />
							<span className="block aspect-square bg-nl-linen" />
							<span className="grid gap-2 p-4">
								<Block className="h-3 w-20" />
								<Block className="h-4 w-full" />
								<Block className="h-4 w-24" />
							</span>
						</span>
					))}
				</div>
			</div>
		</div>
	);
}
