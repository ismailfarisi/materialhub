import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * "Plastic-ban ready" mark. Shown only for a supplier declaration that
 * MaterialHub approved. It names a reviewed declaration, not a certification,
 * so the accessible description says who declared and who reviewed.
 *
 * Board chip with an ink caps label; the check is the only colour, in the
 * success status tone because an approved review is a state, not a category.
 */
export function PlasticBanBadge({
	size = "card",
	className,
}: {
	size?: "card" | "pdp";
	className?: string;
}) {
	const t = useTranslations("eco");
	return (
		<span
			className={cn(
				"inline-flex max-w-full items-center gap-1.5 rounded-sm border border-nl-cacao/15 bg-nl-linen text-nl-cacao",
				size === "card" ? "h-6 px-1.5" : "h-7 px-2",
				className,
			)}
			title={t("badgeTitle")}
		>
			<span
				aria-hidden="true"
				className={cn(
					"grid shrink-0 place-items-center rounded-[2px] bg-status-success text-white",
					size === "card" ? "h-3.5 w-3.5" : "h-4 w-4",
				)}
			>
				<Check className={size === "card" ? "h-2.5 w-2.5" : "h-3 w-3"} strokeWidth={3} />
			</span>
			<span className="mill-label truncate">{t("badge")}</span>
			<span className="sr-only">{t("badgeSr")}</span>
		</span>
	);
}
