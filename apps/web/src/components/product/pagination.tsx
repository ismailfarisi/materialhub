"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

const boxBase =
	"flex h-9 w-9 items-center justify-center border font-serif text-[15px] transition-colors";
const boxIdle =
	"bg-transparent text-nl-cacao border-nl-cacao/20 hover:border-nl-cacao/40";
const boxActive = "bg-nl-cacao text-nl-linen border-nl-cacao";

export function Pagination({
	totalItems,
	pageSize = 24,
}: {
	totalItems: number;
	pageSize?: number;
}) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const currentPage = Number(searchParams.get("page")) || 1;
	const totalPages = Math.ceil(totalItems / pageSize);

	if (totalPages <= 1) return null;

	function goToPage(page: number) {
		const params = new URLSearchParams(searchParams.toString());
		params.set("page", String(page));
		router.replace(`?${params.toString()}`, { scroll: true });
	}

	const pages: number[] = [];
	for (
		let i = Math.max(1, currentPage - 2);
		i <= Math.min(totalPages, currentPage + 2);
		i++
	) {
		pages.push(i);
	}

	const shown = Math.min(currentPage * pageSize, totalItems);
	const progressPct = totalItems ? (shown / totalItems) * 100 : 0;

	const ellipsis = (key: string) => (
		<span
			key={key}
			className="flex h-9 w-6 items-end justify-center pb-1 text-nl-russet"
		>
			…
		</span>
	);

	return (
		<nav
			aria-label="Pagination"
			className="flex flex-col items-center gap-7 pt-[72px] pb-6"
		>
			<div className="flex items-center justify-center gap-3.5">
				<button
					type="button"
					aria-label="Previous page"
					onClick={() => goToPage(currentPage - 1)}
					disabled={currentPage === 1}
					className={`${boxBase} ${boxIdle} disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-nl-cacao/20`}
				>
					<ArrowLeft
						className="h-3.5 w-3.5"
						strokeWidth={1.25}
						aria-hidden="true"
					/>
				</button>

				{pages[0] > 1 && (
					<>
						<button
							type="button"
							onClick={() => goToPage(1)}
							className={`${boxBase} ${boxIdle}`}
						>
							1
						</button>
						{pages[0] > 2 && ellipsis("lead")}
					</>
				)}

				{pages.map((p) => (
					<button
						key={p}
						type="button"
						aria-current={p === currentPage ? "page" : undefined}
						onClick={() => goToPage(p)}
						className={`${boxBase} ${p === currentPage ? boxActive : boxIdle}`}
					>
						{p}
					</button>
				))}

				{pages[pages.length - 1] < totalPages && (
					<>
						{pages[pages.length - 1] < totalPages - 1 && ellipsis("trail")}
						<button
							type="button"
							onClick={() => goToPage(totalPages)}
							className={`${boxBase} ${boxIdle}`}
						>
							{totalPages}
						</button>
					</>
				)}

				<button
					type="button"
					aria-label="Next page"
					onClick={() => goToPage(currentPage + 1)}
					disabled={currentPage === totalPages}
					className={`${boxBase} ${boxIdle} disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-nl-cacao/20`}
				>
					<ArrowRight
						className="h-3.5 w-3.5"
						strokeWidth={1.25}
						aria-hidden="true"
					/>
				</button>
			</div>

			<span className="text-[10px] uppercase tracking-[0.22em] text-nl-russet">
				<span className="text-nl-cacao">{shown.toLocaleString()}</span> of{" "}
				{totalItems.toLocaleString()} shown
			</span>

			<div className="relative h-0.5 w-[200px] bg-nl-cacao/15">
				<div
					className="absolute left-0 top-0 h-full bg-nl-amber transition-[width] duration-300"
					style={{ width: `${progressPct}%` }}
				/>
			</div>
		</nav>
	);
}
