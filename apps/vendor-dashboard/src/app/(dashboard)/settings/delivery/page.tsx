"use client";

import {
	BASIS_LABEL,
	EMIRATES,
	type Speed,
	WEEKDAYS,
	countdown,
	formatDate,
	previewHeadline,
	sameSettings,
	setSpeed,
	speedFor,
	toggleDay,
	validate,
} from "@/components/delivery/delivery-settings.helpers";
import {
	type WarehouseDelivery,
	type WarehouseDeliverySettings,
	useDeliveryPreview,
	useSaveWarehouseDelivery,
	useWarehouseDelivery,
} from "@/lib/queries/delivery";
import { Button, Card, Input, Label, toast } from "@materialhub/ui";
import { useEffect, useMemo, useState } from "react";

const SPEEDS: { value: Speed; label: string }[] = [
	{ value: "standard", label: "Standard" },
	{ value: "next_day", label: "Next-day" },
	{ value: "same_day", label: "Same-day" },
];

function pick(w: WarehouseDelivery): WarehouseDeliverySettings {
	return {
		dispatch_cutoff_time: w.dispatch_cutoff_time,
		handling_days: w.handling_days,
		working_days: [...w.working_days],
		same_day_emirates: [...w.same_day_emirates],
		next_day_emirates: [...w.next_day_emirates],
	};
}

export default function DeliverySettingsPage() {
	const warehouses = useWarehouseDelivery();
	const [warehouseId, setWarehouseId] = useState<string>();
	const current =
		(warehouses.data ?? []).find((w) => w.warehouse_id === warehouseId) ??
		warehouses.data?.[0];
	const [draft, setDraft] = useState<WarehouseDeliverySettings | null>(null);

	useEffect(() => {
		if (current) setDraft(pick(current));
	}, [current]);

	if (warehouses.isLoading)
		return <div className="p-6 text-sm text-gray-500">Loading warehouses…</div>;
	if (warehouses.isError)
		return (
			<div className="p-6 text-sm text-red-600">
				Couldn't load your warehouses. Refresh the page to try again.
			</div>
		);
	if (!current || !draft)
		return (
			<div className="space-y-2 p-6">
				<h1 className="text-2xl font-bold text-gray-900">Delivery promise</h1>
				<p className="text-sm text-gray-500">
					You have no warehouse of your own yet. Delivery dates show on your
					listings once one is set up.
				</p>
			</div>
		);

	return (
		<div className="space-y-5">
			<div>
				<h1 className="text-2xl font-bold text-gray-900">Delivery promise</h1>
				<p className="max-w-2xl text-sm text-gray-500">
					Buyers see "Get it by …" on your product pages, in the cart and at
					checkout. It is worked out from these settings in Dubai time, skipping
					public holidays.
				</p>
			</div>

			{(warehouses.data?.length ?? 0) > 1 && (
				<div className="flex flex-wrap items-center gap-2">
					<Label htmlFor="wh">Warehouse</Label>
					<select
						id="wh"
						className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm"
						value={current.warehouse_id}
						onChange={(e) => setWarehouseId(e.target.value)}
					>
						{warehouses.data?.map((w) => (
							<option key={w.warehouse_id} value={w.warehouse_id}>
								{w.name} ({w.emirate}){w.is_default ? " · default" : ""}
							</option>
						))}
					</select>
				</div>
			)}

			<div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
				<SettingsForm warehouse={current} draft={draft} setDraft={setDraft} />
				<PreviewCard warehouse={current} draft={draft} />
			</div>
		</div>
	);
}

function SettingsForm({
	warehouse,
	draft,
	setDraft,
}: {
	warehouse: WarehouseDelivery;
	draft: WarehouseDeliverySettings;
	setDraft: (s: WarehouseDeliverySettings) => void;
}) {
	const save = useSaveWarehouseDelivery();
	const error = validate(draft);
	const dirty = !sameSettings(draft, warehouse);

	const onSave = async () => {
		if (error) return;
		try {
			await save.mutateAsync({ id: warehouse.warehouse_id, settings: draft });
			toast({ title: "Delivery settings saved" });
		} catch (e: unknown) {
			const message =
				(e as { response?: { data?: { message?: string } } })?.response?.data
					?.message ?? "Save failed. Try again.";
			toast({
				title: "Couldn't save",
				description: message,
				variant: "destructive",
			});
		}
	};

	return (
		<Card className="space-y-6 p-5">
			<div>
				<h2 className="font-semibold text-gray-900">{warehouse.name}</h2>
				<p className="text-sm text-gray-500">
					Ships from {warehouse.emirate} · {warehouse.code}
				</p>
			</div>

			<div className="grid gap-4 sm:grid-cols-2">
				<div className="space-y-1.5">
					<Label htmlFor="cutoff">Daily dispatch cutoff (Dubai time)</Label>
					<Input
						id="cutoff"
						type="time"
						step={60}
						value={draft.dispatch_cutoff_time}
						onChange={(e) =>
							setDraft({
								...draft,
								dispatch_cutoff_time: e.target.value.slice(0, 5),
							})
						}
					/>
					<p className="text-xs text-gray-500">
						Orders placed before this time count today.
					</p>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="handling">Handling days</Label>
					<Input
						id="handling"
						type="number"
						min={0}
						max={60}
						inputMode="numeric"
						value={draft.handling_days}
						onChange={(e) =>
							setDraft({
								...draft,
								handling_days: Number.parseInt(e.target.value || "0", 10),
							})
						}
					/>
					<p className="text-xs text-gray-500">
						Working days to pack before dispatch. 0 means it leaves the same
						day. Made-to-order products can set their own.
					</p>
				</div>
			</div>

			<fieldset className="space-y-2">
				<legend className="text-sm font-medium text-gray-900">
					Working days
				</legend>
				<div className="flex flex-wrap gap-2">
					{WEEKDAYS.map((d) => {
						const on = draft.working_days.includes(d.value);
						return (
							<button
								key={d.value}
								type="button"
								aria-pressed={on}
								onClick={() => setDraft(toggleDay(draft, d.value))}
								className={
									on
										? "h-9 min-w-12 rounded-md border border-gray-900 bg-gray-900 px-3 text-sm font-medium text-white"
										: "h-9 min-w-12 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-700 hover:border-gray-500"
								}
							>
								{d.label}
							</button>
						);
					})}
				</div>
				<p className="text-xs text-gray-500">
					Days the warehouse dispatches. Friday and Saturday are up to you.
				</p>
			</fieldset>

			<fieldset className="space-y-2">
				<legend className="text-sm font-medium text-gray-900">
					Delivery speed by destination
				</legend>
				<p className="text-xs text-gray-500">
					Same-day means delivered on the dispatch day; next-day means the
					following delivery day. Only promise what your courier reliably does.
				</p>
				<div className="overflow-hidden rounded-md border border-gray-200">
					<table className="min-w-full text-sm" data-stack="sm">
						<thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
							<tr>
								<th className="px-3 py-2">Emirate</th>
								{SPEEDS.map((s) => (
									<th key={s.value} className="px-3 py-2 text-center">
										{s.label}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{EMIRATES.map((e) => {
								const speed = speedFor(draft, e);
								return (
									<tr key={e} className="border-t border-gray-100">
										<td
											className="px-3 py-2 font-medium text-gray-900"
											data-card-title
										>
											{e}
										</td>
										{SPEEDS.map((s) => (
											<td
												key={s.value}
												className="px-3 py-2 text-center"
												data-label={s.label}
											>
												<input
													type="radio"
													name={`speed-${e}`}
													aria-label={`${s.label} to ${e}`}
													checked={speed === s.value}
													onChange={() => setDraft(setSpeed(draft, e, s.value))}
													className="h-4 w-4 accent-gray-900"
												/>
											</td>
										))}
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			</fieldset>

			{error && (
				<p role="alert" className="text-sm text-red-600">
					{error}
				</p>
			)}
			<div className="flex items-center gap-3">
				<Button onClick={onSave} disabled={!dirty || !!error || save.isPending}>
					{save.isPending ? "Saving…" : "Save delivery settings"}
				</Button>
				{dirty && (
					<Button variant="outline" onClick={() => setDraft(pick(warehouse))}>
						Discard changes
					</Button>
				)}
			</div>
		</Card>
	);
}

function PreviewCard({
	warehouse,
	draft,
}: { warehouse: WarehouseDelivery; draft: WarehouseDeliverySettings }) {
	const [emirate, setEmirate] = useState<string>(warehouse.emirate || "Dubai");
	const valid = !validate(draft);
	const settings = useMemo(() => (valid ? draft : null), [valid, draft]);
	const preview = useDeliveryPreview(warehouse.warehouse_id, settings, emirate);
	const now = new Date();
	const p = preview.data;
	const left = p
		? countdown(
				Math.max(
					0,
					Math.ceil((Date.parse(p.cutoffAt) - now.getTime()) / 60_000),
				),
			)
		: null;

	return (
		<Card className="space-y-4 p-5 lg:sticky lg:top-24">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<h2 className="font-semibold text-gray-900">Live preview</h2>
				<label className="flex items-center gap-2 text-sm text-gray-600">
					Buyer in
					<select
						className="h-8 rounded-md border border-gray-300 bg-white px-2 text-sm"
						value={emirate}
						onChange={(e) => setEmirate(e.target.value)}
					>
						{EMIRATES.map((e) => (
							<option key={e}>{e}</option>
						))}
					</select>
				</label>
			</div>
			<p className="text-xs text-gray-500">
				What a buyer ordering right now sees, with your unsaved changes.
			</p>

			<div
				aria-live="polite"
				className="rounded-md border border-gray-200 bg-gray-50 p-4"
			>
				{!valid ? (
					<p className="text-sm text-gray-500">
						Fix the settings to see the preview.
					</p>
				) : preview.isError ? (
					<p className="text-sm text-red-600">
						Preview unavailable. Your settings can still be saved.
					</p>
				) : !p ? (
					<p className="text-sm text-gray-500">Working it out…</p>
				) : (
					<div className="space-y-1.5">
						<p className="flex flex-wrap items-center gap-2 text-base font-semibold text-gray-900">
							{previewHeadline(p, now)}
							{p.speed !== "standard" && (
								<span className="rounded-sm border border-gray-400 px-1.5 text-[11px] font-semibold uppercase tracking-wide">
									{p.speed === "same_day" ? "Same-day" : "Next-day"}
								</span>
							)}
						</p>
						{left && (
							<p className="text-sm text-gray-700">
								Order within{" "}
								<span className="font-medium tabular-nums">{left}</span>
							</p>
						)}
						<p className="text-sm text-gray-500">
							Estimated delivery to {emirate}
						</p>
					</div>
				)}
			</div>

			{p && valid && (
				<dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
					<dt className="text-gray-500">Dispatch</dt>
					<dd className="text-gray-900 tabular-nums">
						{formatDate(p.dispatchDate)}
					</dd>
					<dt className="text-gray-500">Transit</dt>
					<dd className="text-gray-900">
						{p.transitDays.min === p.transitDays.max
							? `${p.transitDays.min} day${p.transitDays.min === 1 ? "" : "s"}`
							: `${p.transitDays.min}–${p.transitDays.max} days`}
						<span className="block text-xs text-gray-500">
							from {BASIS_LABEL[p.basis]}
						</span>
					</dd>
					{p.dependsOnEstimatedHoliday && (
						<>
							<dt className="text-gray-500">Holiday</dt>
							<dd className="text-gray-900">
								An estimated public holiday moves this date.
							</dd>
						</>
					)}
				</dl>
			)}
		</Card>
	);
}
