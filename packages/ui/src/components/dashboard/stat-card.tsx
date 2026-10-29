"use client";

import { ArrowDown, ArrowUp } from "@phosphor-icons/react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { cn } from "../../lib/utils";

type TrendObject = { value: number; direction: "up" | "down" };

interface StatCardProps {
	title: string;
	value: string | number;
	// Accepts a raw percentage-change number (direction derived from its sign)
	// or an explicit { value, direction }. null/undefined/0/NaN hides the trend.
	trend?: number | TrendObject | null;
	icon?: React.ReactNode;
}

function normalizeTrend(trend: StatCardProps["trend"]): TrendObject | null {
	if (trend == null) return null;
	if (typeof trend === "number") {
		if (!Number.isFinite(trend) || trend === 0) return null;
		return { value: Math.abs(trend), direction: trend > 0 ? "up" : "down" };
	}
	if (!Number.isFinite(trend.value)) return null;
	return trend;
}

export function StatCard({ title, value, trend, icon }: StatCardProps) {
	const t = normalizeTrend(trend);
	return (
		<Card className="rounded-lg bg-cacao border border-pearl/14 p-6 shadow-lg">
			<CardHeader className="flex flex-row items-center justify-between pb-2">
				<CardTitle className="text-sm font-medium text-pearl uppercase tracking-wide">
					{title}
				</CardTitle>
				{icon && <span className="text-taupe">{icon}</span>}
			</CardHeader>
			<CardContent>
				<div className="text-3xl font-bold text-linen">{value}</div>
				{t && (
					<div
						className={cn(
							"flex items-center gap-1 mt-1 text-xs font-medium",
							t.direction === "up" ? "text-amber" : "text-russet",
						)}
					>
						{t.direction === "up" ? (
							<ArrowUp className="w-3.5 h-3.5" />
						) : (
							<ArrowDown className="w-3.5 h-3.5" />
						)}
						<span>{Math.abs(t.value)}%</span>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
