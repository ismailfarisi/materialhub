import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

/** One supplier's estimate, as order-service `domain/shipping/estimate` returns it. */
export interface DeliveryEstimate {
	vendor_id: string | null;
	warehouse_id: string;
	origin_emirate: string;
	destination_emirate: string;
	/** "YYYY-MM-DD", Asia/Dubai. */
	earliest: string;
	latest: string;
	dispatchDate: string;
	cutoffAt: string;
	minutesToCutoff: number;
	speed: "same_day" | "next_day" | "standard";
	sameDay: boolean;
	nextDay: boolean;
	handlingDays: number;
	transitDays: { min: number; max: number };
	basis: "same_day_zone" | "next_day_zone" | "shipping_rate" | "default";
	dependsOnEstimatedHoliday: boolean;
	timeZone: "Asia/Dubai";
}

export interface EstimateRequest {
	vendorId: string;
	emirate: string;
	productIds?: string[];
	method?: string | null;
}

interface Pending {
	req: EstimateRequest;
	resolve: (e: DeliveryEstimate | null) => void;
	reject: (err: unknown) => void;
}

const MAX_GROUPS = 50;
const BATCH_WINDOW_MS = 12;
let queue: Pending[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

async function flush() {
	timer = null;
	const pending = queue;
	queue = [];
	// One POST per destination and method, at most 50 suppliers each.
	const buckets = new Map<string, Pending[]>();
	for (const p of pending) {
		const key = `${p.req.emirate}|${p.req.method ?? ""}`;
		const list = buckets.get(key) ?? [];
		list.push(p);
		buckets.set(key, list);
	}
	for (const list of buckets.values()) {
		for (let i = 0; i < list.length; i += MAX_GROUPS) {
			const chunk = list.slice(i, i + MAX_GROUPS);
			const { emirate, method } = chunk[0].req;
			try {
				const { data } = await api.post("/shipping/delivery-estimate/batch", {
					emirate,
					...(method ? { method } : {}),
					groups: chunk.map((p) => ({
						vendor_id: p.req.vendorId,
						...(p.req.productIds?.length
							? { product_ids: p.req.productIds }
							: {}),
					})),
				});
				const rows: Array<{ estimate: DeliveryEstimate | null }> =
					data?.data ?? [];
				chunk.forEach((p, idx) => p.resolve(rows[idx]?.estimate ?? null));
			} catch (err) {
				for (const p of chunk) p.reject(err);
			}
		}
	}
}

/**
 * Ask for one supplier's estimate. Calls made in the same tick (every supplier
 * group on the cart or checkout page) share one batch request.
 */
export function fetchDeliveryEstimate(
	req: EstimateRequest,
): Promise<DeliveryEstimate | null> {
	return new Promise((resolve, reject) => {
		queue.push({ req, resolve, reject });
		if (!timer) timer = setTimeout(flush, BATCH_WINDOW_MS);
	});
}

export function useDeliveryEstimate(req: Partial<EstimateRequest>) {
	const productKey = [...(req.productIds ?? [])].sort().join(",");
	return useQuery({
		queryKey: [
			"delivery-estimate",
			req.vendorId,
			req.emirate,
			productKey,
			req.method ?? null,
		],
		queryFn: () => fetchDeliveryEstimate(req as EstimateRequest),
		enabled: Boolean(req.vendorId && req.emirate),
		staleTime: 60_000,
		// Refresh each minute so a passed cutoff rolls the date forward.
		refetchInterval: 60_000,
		retry: 1,
	});
}
