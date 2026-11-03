import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * Full-page payment status (Tamara return pages): a status mark, a heading
 * that states what happened, a body that says what it means for the buyer,
 * the order reference, and the next step.
 */
export function StatusPanel({
	tone,
	icon,
	title,
	body,
	orderRef,
	orderRefLabel,
	children,
	footer,
}: {
	tone: "pending" | "error" | "neutral";
	icon: ReactNode;
	title: ReactNode;
	body: ReactNode;
	orderRef?: string;
	orderRefLabel?: string;
	children?: ReactNode;
	footer?: ReactNode;
}) {
	return (
		<div className="mx-auto flex min-h-[70vh] w-full max-w-[1400px] items-center justify-center px-4 py-12 md:px-8">
			<div className="grid w-full max-w-[460px] gap-6 rounded-md bg-nl-pearl p-6 shadow-card sm:p-8">
				<div className="grid justify-items-start gap-4">
					<span
						aria-hidden="true"
						className={cn(
							"inline-grid h-11 w-11 place-items-center rounded-md",
							tone === "error" && "bg-destructive/10 text-destructive",
							tone === "pending" && "bg-nl-linen text-nl-cacao",
							tone === "neutral" && "bg-nl-linen text-nl-cacao",
						)}
					>
						{icon}
					</span>
					<div className="grid gap-2">
						<h1 className="m-0 font-display text-[22px] font-semibold leading-tight tracking-[-0.02em] text-nl-cacao">
							{title}
						</h1>
						<p className="m-0 max-w-[52ch] text-[15px] leading-relaxed text-nl-russet">{body}</p>
					</div>
					{orderRef && (
						<p className="m-0 flex items-baseline gap-2 text-[13px] text-nl-russet">
							{orderRefLabel}
							<span dir="ltr" className="rounded-sm bg-nl-linen px-1.5 py-0.5 font-mono text-[12.5px] uppercase tabular-nums text-nl-cacao">
								{orderRef.slice(0, 8)}
							</span>
						</p>
					)}
				</div>
				{children && <div className="grid gap-2">{children}</div>}
				{footer}
			</div>
		</div>
	);
}
