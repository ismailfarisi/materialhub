"use client";
import { ReelAnalyticsHeader } from "@/components/reel-analytics/ReelAnalyticsHeader";
import { ReelAnalyticsKpiCards } from "@/components/reel-analytics/ReelAnalyticsKpiCards";
import { ReelAnalyticsTimeseries } from "@/components/reel-analytics/ReelAnalyticsTimeseries";
import { ReelConversionFunnel } from "@/components/reel-analytics/ReelConversionFunnel";
import { ReelLeaderboard } from "@/components/reel-analytics/ReelLeaderboard";
import { VendorFilter } from "@/components/reel-analytics/VendorFilter";
import {
	type Period,
	useAdminReelOverview,
} from "@/lib/queries/reel-analytics";
import { useState } from "react";

export default function AdminReelAnalyticsPage() {
	const [period, setPeriod] = useState<Period>("30d");
	const [vendorId, setVendorId] = useState<string | undefined>(undefined);
	const { data: overview, isLoading } = useAdminReelOverview(period, vendorId);

	return (
		<div className="space-y-6">
			<ReelAnalyticsHeader
				period={period}
				onPeriodChange={setPeriod}
				asOf={overview?.asOf}
			/>
			<VendorFilter value={vendorId} onChange={setVendorId} />
			<ReelAnalyticsKpiCards overview={overview} isLoading={isLoading} />
			<ReelAnalyticsTimeseries overview={overview} isLoading={isLoading} />
			<ReelConversionFunnel overview={overview} isLoading={isLoading} />
			<ReelLeaderboard period={period} vendorId={vendorId} />
		</div>
	);
}
