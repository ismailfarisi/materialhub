"use client";
import Link from "next/link";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@materialhub/ui";
import { ReelAnalyticsHeader } from "@/components/reel-analytics/ReelAnalyticsHeader";
import { ReelAnalyticsKpiCards } from "@/components/reel-analytics/ReelAnalyticsKpiCards";
import { ReelAnalyticsTimeseries } from "@/components/reel-analytics/ReelAnalyticsTimeseries";
import { ReelLeaderboard } from "@/components/reel-analytics/ReelLeaderboard";
import {
	fetchVendorReelOverviewFresh,
	useVendorReelOverview,
	type Period,
} from "@/lib/queries/reel-analytics";

export default function VendorReelAnalyticsPage() {
	const [period, setPeriod] = useState<Period>("30d");
	const queryClient = useQueryClient();
	const overviewKey = ["vendor-reel-analytics", "overview", period] as const;
	const { data: overview, isLoading, isFetching } = useVendorReelOverview(period);
	const [isRefreshing, setIsRefreshing] = useState(false);

	const handleRefresh = async () => {
		setIsRefreshing(true);
		try {
			const fresh = await fetchVendorReelOverviewFresh(period);
			queryClient.setQueryData(overviewKey, fresh);
			await queryClient.invalidateQueries({
				queryKey: ["vendor-reel-analytics", "leaderboard"],
			});
		} finally {
			setIsRefreshing(false);
		}
	};

	const isEmpty =
		!isLoading &&
		overview &&
		overview.kpis.impressions.value === 0 &&
		overview.kpis.productTaps.value === 0 &&
		overview.kpis.attributedOrders.value === 0;

	if (isEmpty) {
		return (
			<div className="space-y-6">
				<ReelAnalyticsHeader
					period={period}
					onPeriodChange={setPeriod}
					asOf={overview?.asOf}
					onRefresh={handleRefresh}
					isRefreshing={isRefreshing || isFetching}
				/>
				<Card>
					<CardContent className="p-10 text-center space-y-3">
						<h2 className="text-lg font-semibold">No reels are tagging your products yet.</h2>
						<p className="text-sm text-gray-500">Invite creators from the Reels Program to start earning visibility.</p>
						<Link href="/reels-program" className="inline-block px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm">
							Learn about the Reels Program →
						</Link>
					</CardContent>
				</Card>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<ReelAnalyticsHeader
				period={period}
				onPeriodChange={setPeriod}
				asOf={overview?.asOf}
				onRefresh={handleRefresh}
				isRefreshing={isRefreshing || isFetching}
			/>
			<ReelAnalyticsKpiCards overview={overview} isLoading={isLoading} />
			<ReelAnalyticsTimeseries overview={overview} isLoading={isLoading} />
			<ReelLeaderboard period={period} />
		</div>
	);
}
