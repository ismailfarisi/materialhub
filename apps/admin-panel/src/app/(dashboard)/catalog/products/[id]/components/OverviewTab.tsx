import { Card, CardContent, CardHeader, CardTitle, StatusBadge } from "@materialhub/ui";

interface OverviewTabProps {
  product: any;
  formatPrice: (fils: number) => string;
  formatDate: (iso: string) => string;
}

export function OverviewTab({ product, formatPrice, formatDate }: OverviewTabProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <Card>
        <CardHeader><CardTitle>Product Info</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between"><span className="text-taupe">Name</span><span>{product.name}</span></div>
          <div className="flex justify-between"><span className="text-taupe">Status</span><StatusBadge status={product.status} /></div>
          <div className="flex justify-between"><span className="text-taupe">Price</span><span>{formatPrice(product.price)}</span></div>
          {product.brand && <div className="flex justify-between"><span className="text-taupe">Brand</span><span>{product.brand.name}</span></div>}
          <div className="flex justify-between"><span className="text-taupe">SKU</span><span>{product.sku || "—"}</span></div>
          <div className="flex justify-between"><span className="text-taupe">Created</span><span>{formatDate(product.created_at)}</span></div>
          {product.published_at && <div className="flex justify-between"><span className="text-taupe">Published</span><span>{formatDate(product.published_at)}</span></div>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Stats</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between"><span className="text-taupe">Rating</span><span>{product.rating_avg != null ? Number(product.rating_avg).toFixed(1) : "—"} ({product.rating_count ?? 0} reviews)</span></div>
          <div className="flex justify-between"><span className="text-taupe">Sales</span><span>{product.sales_count ?? 0}</span></div>
          <div className="flex justify-between"><span className="text-taupe">Wishlisted</span><span>{product.wishlist_count ?? 0}</span></div>
          <div className="flex justify-between"><span className="text-taupe">Images</span><span>{product.images?.length ?? 0}</span></div>
          <div className="flex justify-between"><span className="text-taupe">Variants</span><span>{product.variants?.length ?? 0}</span></div>
        </CardContent>
      </Card>
    </div>
  );
}
