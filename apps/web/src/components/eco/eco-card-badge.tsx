import { isPlasticBanReady } from "./eco-data";
import { PlasticBanBadge } from "./plastic-ban-badge";

/**
 * The ProductCard insertion point for the eco catalogue: renders the badge
 * when the listing document says the product is plastic-ban ready, otherwise
 * nothing. Kept here so ProductCard only carries a one-line call.
 */
export function EcoCardBadge({
	product,
}: {
	product: { plastic_ban_ready?: boolean | null };
}) {
	if (!isPlasticBanReady(product)) return null;
	return <PlasticBanBadge size="card" className="self-start" />;
}
