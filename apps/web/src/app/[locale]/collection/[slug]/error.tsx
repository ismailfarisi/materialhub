"use client";

import { CollectionNotice } from "@/components/home/collection-empty";
import { buttonVariants } from "@/components/swatch/button";
import { CloudOff, RotateCw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

/** Collection error state: say it failed, offer a retry, keep the categories one tap away. */
export default function CollectionError({
	reset,
}: { error: Error; reset: () => void }) {
	const locale = useLocale();
	const t = useTranslations("home");
	return (
		<div className="mx-auto max-w-[1400px] px-4 md:px-8 py-10 md:py-16">
			<CollectionNotice
				locale={locale}
				title={t("collection.errorTitle")}
				body={t("collection.errorBody")}
				icon={<CloudOff className="h-5 w-5" strokeWidth={1.75} />}
				categoryLabel={(k) => t(`stocks.${k}.name`)}
				action={
					<button
						type="button"
						onClick={reset}
						className={buttonVariants({ variant: "primary", size: "md" })}
					>
						<RotateCw
							aria-hidden="true"
							className="h-4 w-4"
							strokeWidth={1.75}
						/>
						{t("collection.retry")}
					</button>
				}
			/>
		</div>
	);
}
