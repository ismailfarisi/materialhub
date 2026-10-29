import type { ReactNode } from "react";

interface StaticPageLayoutProps {
	eyebrow?: string;
	title: string;
	intro?: string;
	children: ReactNode;
}

export function StaticPageLayout({
	eyebrow,
	title,
	intro,
	children,
}: StaticPageLayoutProps) {
	return (
		<div className="bg-nl-linen text-nl-cacao">
			<section className="bg-nl-espresso text-nl-pearl">
				<div className="max-w-[1400px] mx-auto px-4 md:px-12 py-16 md:py-24">
					{eyebrow && (
						<p className="text-[10px] tracking-[0.22em] uppercase text-nl-amber mb-4">
							{eyebrow}
						</p>
					)}
					<h1 className="font-serif text-4xl md:text-6xl leading-[1.05]">
						{title}
					</h1>
					{intro && (
						<p className="font-serif italic text-lg md:text-xl text-nl-linen/85 mt-5 max-w-[640px] leading-[1.55]">
							{intro}
						</p>
					)}
				</div>
			</section>

			<section className="max-w-[860px] mx-auto px-4 md:px-12 py-14 md:py-20">
				<div className="prose-static space-y-8">{children}</div>
			</section>
		</div>
	);
}

interface StaticSectionProps {
	heading?: string;
	children: ReactNode;
}

export function StaticSection({ heading, children }: StaticSectionProps) {
	return (
		<section>
			{heading && (
				<h2 className="font-serif text-2xl md:text-3xl text-nl-cacao mb-4">
					{heading}
				</h2>
			)}
			<div className="text-nl-russet text-[15px] md:text-base leading-[1.75] space-y-4">
				{children}
			</div>
		</section>
	);
}
