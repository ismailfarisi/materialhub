"use client";

import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";

const box =
	"inline-flex h-10 min-w-10 items-center justify-center rounded-md border px-2 font-mono text-[13.5px] tabular-nums transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nl-amber";
const idle = "border-nl-cacao/15 bg-nl-pearl text-nl-cacao hover:border-nl-cacao/50";
const active = "border-nl-cacao bg-nl-cacao text-white";

export function Pagination({
	totalItems,
	pageSize = 24,
}: {
	totalItems: number;
	pageSize?: number;
}) {
	const t = useTranslations("browse");
	const locale = useLocale();
	const router = useRouter();
	const searchParams = useSearchParams();
	const currentPage = Number(searchParams.get("page")) || 1;
	const totalPages = Math.ceil(totalItems / pageSize);

	if (totalPages <= 1) return null;

	const nf = new Intl.NumberFormat(locale === "ar" ? "ar-AE" : "en-AE");

	function goToPage(page: number) {
		const params = new URLSearchParams(searchParams.toString());
		if (page <= 1) params.delete("page");
		else params.set("page", String(page));
		router.replace(`?${params.toString()}`, { scroll: true });
	}

	const pages: number[] = [];
	for (
		let i = Math.max(1, currentPage - 1);
		i <= Math.min(totalPages, currentPage + 1);
		i++
	) {
		pages.push(i);
	}

	const from = (currentPage - 1) * pageSize + 1;
	const to = Math.min(currentPage * pageSize, totalItems);

	const gap = (key: string) => (
		<span key={key} aria-hidden="true" className="inline-flex h-10 w-5 items-center justify-center font-mono text-nl-russet">
			…
		</span>
	);

	const pageButton = (p: number) => (
		<button
			key={p}
			type="button"
			aria-label={t("pageN", { page: p })}
			aria-current={p === currentPage ? "page" : undefined}
			onClick={() => goToPage(p)}
			className={cn(box, p === currentPage ? active : idle)}
		>
			{nf.format(p)}
		</button>
	);

	return (
		<nav
			aria-label={t("pagination")}
			className="mt-10 flex flex-col items-center gap-3 border-t border-nl-cacao/12 pt-8 md:mt-14"
		>
			<div className="flex items-center gap-1.5">
				<button
					type="button"
					aria-label={t("previousPage")}
					onClick={() => goToPage(currentPage - 1)}
					disabled={currentPage === 1}
					className={cn(box, idle, "disabled:pointer-events-none disabled:opacity-40")}
				>
					<ChevronLeft className="h-4 w-4 rtl:rotate-180" strokeWidth={1.75} aria-hidden="true" />
				</button>

				{pages[0] > 1 && pageButton(1)}
				{pages[0] > 2 && gap("lead")}
				{pages.map(pageButton)}
				{pages[pages.length - 1] < totalPages - 1 && gap("trail")}
				{pages[pages.length - 1] < totalPages && pageButton(totalPages)}

				<button
					type="button"
					aria-label={t("nextPage")}
					onClick={() => goToPage(currentPage + 1)}
					disabled={currentPage === totalPages}
					className={cn(box, idle, "disabled:pointer-events-none disabled:opacity-40")}
				>
					<ChevronRight className="h-4 w-4 rtl:rotate-180" strokeWidth={1.75} aria-hidden="true" />
				</button>
			</div>

			<p className="m-0 text-[13px] text-nl-russet">
				{t.rich("shownRange", {
					from: nf.format(from),
					to: nf.format(to),
					total: nf.format(totalItems),
					n: (chunks) => (
						<span className="font-mono tabular-nums text-nl-cacao">{chunks}</span>
					),
				})}
			</p>
		</nav>
	);
}
