"use client";

import type { WishlistRow } from "@/components/account/types";
import { EmptyState, ErrorState, PageHeader, Skeleton } from "@/components/account/account-ui";
import { ProductCard } from "@/components/product/product-card";
import { Button } from "@/components/swatch";
import { useRemoveFromWishlist, useWishlist } from "@/lib/queries/account";
import { Heart } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

const GRID = "m-0 grid list-none grid-cols-2 gap-3 p-0 md:grid-cols-3 md:gap-4 xl:grid-cols-4";

export default function WishlistPage() {
	const t = useTranslations("account");
	const tCommon = useTranslations("common");
	const locale = useLocale();
	const { data: wishlist, isLoading, isError, refetch } = useWishlist();
	const removeItem = useRemoveFromWishlist();
	const items: WishlistRow[] = wishlist || [];

	return (
		<div>
			<PageHeader
				title={t("wishlist")}
				description={items.length > 0 ? t("wishlistCount", { count: items.length }) : t("wishlistIntro")}
			/>
			{isLoading ? (
				<ul className={GRID} aria-label={tCommon("loading")}>
					{Array.from({ length: 6 }, (_, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
						<li key={i} className="overflow-hidden rounded-md bg-nl-pearl shadow-card">
							<Skeleton className="h-7 w-full rounded-none" />
							<Skeleton className="aspect-square w-full rounded-none" />
							<div className="grid gap-2 p-3">
								<Skeleton className="h-3 w-1/2" />
								<Skeleton className="h-4 w-3/4" />
								<Skeleton className="h-4 w-1/3" />
							</div>
						</li>
					))}
				</ul>
			) : isError ? (
				<ErrorState onRetry={() => refetch()} />
			) : items.length === 0 ? (
				<EmptyState
					icon={Heart}
					title={t("wishlistEmptyTitle")}
					body={t("wishlistEmptyBody")}
					action={{ label: t("startBrowsing"), href: `/${locale}` }}
				/>
			) : (
				<ul className={GRID}>
					{items.map((item) => (
						<li key={item.product_id} className="grid content-start gap-1.5">
							<ProductCard product={item} />
							<Button
								variant="ghost"
								size="sm"
								className="justify-self-start text-nl-russet"
								disabled={removeItem.isPending && removeItem.variables === item.product_id}
								onClick={() => removeItem.mutate(item.product_id)}
							>
								{tCommon("remove")}
								<span className="sr-only">: {item.name}</span>
							</Button>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
