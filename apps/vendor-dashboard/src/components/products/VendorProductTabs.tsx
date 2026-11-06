"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@materialhub/ui";
import { InventoryPanel } from "./InventoryPanel";
import { ProductForm } from "./ProductForm";
import { ProductGroupPanel } from "./ProductGroupPanel";
import { VendorMediaTab } from "./VendorMediaTab";
import { TradePricingPanel } from "./trade/TradePricingPanel";

interface Props {
	productId: string;
	defaultValues: any;
	variants: { id: string; name: string }[];
}

export function VendorProductTabs({
	productId,
	defaultValues,
	variants,
}: Props) {
	return (
		<Tabs defaultValue="details">
			<TabsList>
				<TabsTrigger value="details">Details</TabsTrigger>
				<TabsTrigger value="media">Media</TabsTrigger>
				<TabsTrigger value="pricing">Pricing</TabsTrigger>
				<TabsTrigger value="trade">Trade pricing</TabsTrigger>
				<TabsTrigger value="inventory">Inventory</TabsTrigger>
				<TabsTrigger value="variants">Variants</TabsTrigger>
				<TabsTrigger value="seo">SEO</TabsTrigger>
				<TabsTrigger value="editorial">Editorial</TabsTrigger>
				<TabsTrigger value="color-group">Color group</TabsTrigger>
			</TabsList>

			<TabsContent value="details">
				<ProductForm
					productId={productId}
					defaultValues={defaultValues}
					forceStep="details"
				/>
			</TabsContent>
			<TabsContent value="media">
				<VendorMediaTab productId={productId} variants={variants} />
			</TabsContent>
			<TabsContent value="pricing">
				<ProductForm
					productId={productId}
					defaultValues={defaultValues}
					forceStep="pricing"
				/>
			</TabsContent>
			<TabsContent value="trade">
				<TradePricingPanel productId={productId} />
			</TabsContent>
			<TabsContent value="inventory">
				<div className="py-4">
					<InventoryPanel
						productId={productId}
						inventoryRecords={(defaultValues?.inventoryRecords ?? []).map(
							(r: any, i: number) => ({
								id: r.id ?? `row-${i}`,
								variant_id: r.variant_id ?? null,
								warehouse_id: r.warehouse_id ?? null,
								quantity_on_hand: r.quantity_on_hand ?? 0,
								quantity_reserved: r.quantity_reserved ?? 0,
							}),
						)}
					/>
				</div>
			</TabsContent>
			<TabsContent value="variants">
				<ProductForm
					productId={productId}
					defaultValues={defaultValues}
					forceStep="variants"
				/>
			</TabsContent>
			<TabsContent value="seo">
				<ProductForm
					productId={productId}
					defaultValues={defaultValues}
					forceStep="seo"
				/>
			</TabsContent>
			<TabsContent value="editorial">
				<ProductForm
					productId={productId}
					defaultValues={defaultValues}
					forceStep="editorial"
				/>
			</TabsContent>
			<TabsContent value="color-group">
				<div className="py-4">
					<ProductGroupPanel productId={productId} />
				</div>
			</TabsContent>
		</Tabs>
	);
}
