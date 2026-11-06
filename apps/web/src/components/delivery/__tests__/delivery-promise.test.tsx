import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DeliveryEstimate } from "../delivery-api";

const post = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ api: { post, get: vi.fn() } }));

// Messages render as "key|{json params}" so assertions can see what was asked for.
vi.mock("next-intl", () => {
	const t = (key: string, params?: Record<string, unknown>) =>
		params ? `${key}|${JSON.stringify(params)}` : key;
	t.rich = (
		key: string,
		params: Record<string, unknown> & { b?: (c: ReactNode) => ReactNode },
	) => {
		const { b, ...rest } = params;
		return b ? b(`${key}|${JSON.stringify(rest)}`) : key;
	};
	return { useLocale: () => "en", useTranslations: () => t };
});

const { DeliveryPromiseView } = await import("../delivery-promise");
const { fetchDeliveryEstimate } = await import("../delivery-api");

const estimate = (over: Partial<DeliveryEstimate> = {}): DeliveryEstimate => ({
	vendor_id: "v1",
	warehouse_id: "w1",
	origin_emirate: "Dubai",
	destination_emirate: "Dubai",
	earliest: "2026-11-10",
	latest: "2026-11-10",
	dispatchDate: "2026-11-09",
	cutoffAt: "2026-11-09T10:00:00.000Z",
	minutesToCutoff: 200,
	speed: "next_day",
	sameDay: false,
	nextDay: true,
	handlingDays: 0,
	transitDays: { min: 1, max: 1 },
	basis: "next_day_zone",
	dependsOnEstimatedHoliday: false,
	timeZone: "Asia/Dubai",
	...over,
});

const now = new Date("2026-11-09T10:40:00+04:00");

describe("DeliveryPromiseView", () => {
	it("shows tomorrow, the countdown and the destination", () => {
		render(
			<DeliveryPromiseView estimate={estimate()} emirate="Dubai" now={now} />,
		);
		expect(screen.getByText(/getItTomorrow/)).toBeTruthy();
		expect(screen.getByText(/orderWithin/).textContent).toContain(
			"hoursMinutes",
		);
		expect(screen.getByText("nextDay")).toBeTruthy();
		expect(screen.getByText("estimatedToLabel", { exact: false })).toBeTruthy();
	});

	it("uses 'by' the latest date for a range and offers the earliest", () => {
		render(
			<DeliveryPromiseView
				estimate={estimate({
					earliest: "2026-11-11",
					latest: "2026-11-13",
					speed: "standard",
				})}
				emirate="Fujairah"
				now={now}
			/>,
		);
		expect(screen.getByText(/getItBy/).textContent).toMatch(/13/);
		expect(screen.getByText(/earliest/)).toBeTruthy();
		expect(screen.queryByText("sameDay")).toBeNull();
	});

	it("hides the countdown once the cutoff has passed", () => {
		render(
			<DeliveryPromiseView
				estimate={estimate()}
				emirate="Dubai"
				now={new Date("2026-11-09T14:01:00+04:00")}
			/>,
		);
		expect(screen.queryByText(/orderWithin/)).toBeNull();
	});

	it("notes estimated holidays", () => {
		render(
			<DeliveryPromiseView
				estimate={estimate({ dependsOnEstimatedHoliday: true })}
				emirate="Dubai"
				now={now}
			/>,
		);
		expect(screen.getByText("holidayNote")).toBeTruthy();
	});

	it("lets the buyer change the emirate", () => {
		const onChange = vi.fn();
		render(
			<DeliveryPromiseView
				estimate={estimate()}
				emirate="Dubai"
				onEmirateChange={onChange}
				now={now}
			/>,
		);
		fireEvent.change(screen.getByLabelText("deliverTo"), {
			target: { value: "Sharjah" },
		});
		expect(onChange).toHaveBeenCalledWith("Sharjah");
	});

	it("falls back to an honest message when there is no estimate", () => {
		render(
			<DeliveryPromiseView estimate={null} isError emirate="Dubai" now={now} />,
		);
		expect(screen.getByText("unavailable")).toBeTruthy();
	});
});

describe("fetchDeliveryEstimate", () => {
	beforeEach(() => post.mockReset());

	it("batches suppliers asked for in the same tick into one request", async () => {
		post.mockResolvedValue({
			data: {
				data: [{ estimate: estimate({ vendor_id: "a" }) }, { estimate: null }],
			},
		});
		const [a, b] = await Promise.all([
			fetchDeliveryEstimate({
				vendorId: "a",
				emirate: "Dubai",
				productIds: ["p1"],
			}),
			fetchDeliveryEstimate({ vendorId: "b", emirate: "Dubai" }),
		]);
		expect(post).toHaveBeenCalledTimes(1);
		expect(post.mock.calls[0][0]).toBe("/shipping/delivery-estimate/batch");
		expect(post.mock.calls[0][1]).toEqual({
			emirate: "Dubai",
			groups: [{ vendor_id: "a", product_ids: ["p1"] }, { vendor_id: "b" }],
		});
		expect(a?.vendor_id).toBe("a");
		expect(b).toBeNull();
	});

	it("splits requests by destination and method", async () => {
		post.mockResolvedValue({ data: { data: [{ estimate: null }] } });
		await Promise.all([
			fetchDeliveryEstimate({ vendorId: "a", emirate: "Dubai" }),
			fetchDeliveryEstimate({ vendorId: "a", emirate: "Sharjah" }),
			fetchDeliveryEstimate({
				vendorId: "a",
				emirate: "Dubai",
				method: "express",
			}),
		]);
		expect(post).toHaveBeenCalledTimes(3);
	});
});
