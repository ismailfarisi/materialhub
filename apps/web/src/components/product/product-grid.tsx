import { ProductCard } from "./product-card";

export function ProductGrid({
	products,
	view = "grid",
}: {
	// biome-ignore lint/suspicious/noExplicitAny: Product type not yet exported from product-card
	products: any[];
	view?: string;
}) {
	if (view === "list") {
		return (
			<div className="space-y-4">
				{products.map((product) => (
					<ProductCard key={product.id} product={product} />
				))}
			</div>
		);
	}

	return (
		<div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
			{products.map((product) => (
				<ProductCard key={product.id} product={product} />
			))}
		</div>
	);
}
