"use client";

import {
	type PublicHoliday,
	useCreatePublicHoliday,
	useDeletePublicHoliday,
	usePublicHolidays,
	useUpdatePublicHoliday,
} from "@/lib/queries/public-holidays";
import {
	Badge,
	Button,
	Card,
	CardContent,
	Input,
	Label,
	Switch,
	toast,
} from "@materialhub/ui";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

function errorMessage(e: unknown, fallback: string): string {
	return (
		(e as { response?: { data?: { message?: string } } })?.response?.data
			?.message ?? fallback
	);
}

function weekday(iso: string): string {
	return new Intl.DateTimeFormat("en-AE", {
		weekday: "short",
		timeZone: "UTC",
	}).format(new Date(`${iso}T00:00:00Z`));
}

const EMPTY = { holiday_date: "", name: "", name_ar: "", is_estimate: true };

/**
 * Public holidays the delivery estimate skips for dispatch and transit.
 * Islamic holidays follow the moon sighting: keep them marked as estimates
 * until the government announces them, so buyers are told the date may move.
 */
export default function PublicHolidaysPage() {
	const thisYear = new Date().getUTCFullYear();
	const [year, setYear] = useState(thisYear);
	const holidays = usePublicHolidays(year);
	const create = useCreatePublicHoliday();
	const [form, setForm] = useState(EMPTY);

	const onAdd = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!form.holiday_date || !form.name.trim()) return;
		try {
			await create.mutateAsync({
				...form,
				name_ar: form.name_ar || null,
				is_active: true,
			});
			toast({ title: "Holiday added" });
			setForm(EMPTY);
		} catch (err) {
			toast({
				title: "Couldn't add holiday",
				description: errorMessage(err, "Try again."),
				variant: "destructive",
			});
		}
	};

	const rows = holidays.data ?? [];
	const estimates = rows.filter((h) => h.is_estimate).length;

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-semibold">Public holidays</h1>
				<p className="max-w-2xl text-sm text-slate-500">
					Delivery estimates skip these days for warehouse dispatch and courier
					transit. Keep moon-dependent dates marked as estimates until they are
					announced; buyers are told when an estimated holiday moves their date.
				</p>
			</div>

			<fieldset className="flex flex-wrap items-center gap-2">
				<legend className="sr-only">Year</legend>
				{[thisYear - 1, thisYear, thisYear + 1, thisYear + 2].map((y) => (
					<Button
						key={y}
						size="sm"
						variant={y === year ? "default" : "outline"}
						onClick={() => setYear(y)}
						aria-pressed={y === year}
					>
						{y}
					</Button>
				))}
			</fieldset>

			<Card>
				<CardContent className="p-4">
					<form
						onSubmit={onAdd}
						className="grid items-end gap-3 md:grid-cols-[160px_1fr_1fr_auto_auto]"
					>
						<div className="space-y-1">
							<Label htmlFor="h-date">Date</Label>
							<Input
								id="h-date"
								type="date"
								required
								value={form.holiday_date}
								onChange={(e) =>
									setForm({ ...form, holiday_date: e.target.value })
								}
							/>
						</div>
						<div className="space-y-1">
							<Label htmlFor="h-name">Name</Label>
							<Input
								id="h-name"
								required
								maxLength={150}
								placeholder="Eid al-Fitr"
								value={form.name}
								onChange={(e) => setForm({ ...form, name: e.target.value })}
							/>
						</div>
						<div className="space-y-1">
							<Label htmlFor="h-name-ar">Arabic name</Label>
							<Input
								id="h-name-ar"
								dir="rtl"
								lang="ar"
								maxLength={150}
								placeholder="عيد الفطر"
								value={form.name_ar}
								onChange={(e) => setForm({ ...form, name_ar: e.target.value })}
							/>
						</div>
						<div className="flex h-10 items-center gap-2 text-sm">
							<Switch
								id="h-estimate"
								checked={form.is_estimate}
								onCheckedChange={(v) => setForm({ ...form, is_estimate: v })}
							/>
							<Label htmlFor="h-estimate">Estimated</Label>
						</div>
						<Button type="submit" disabled={create.isPending}>
							<Plus className="mr-1 h-4 w-4" aria-hidden="true" />
							Add holiday
						</Button>
					</form>
				</CardContent>
			</Card>

			<Card>
				<CardContent className="p-0">
					{holidays.isLoading ? (
						<p className="p-4 text-sm text-slate-500">Loading…</p>
					) : holidays.isError ? (
						<p className="p-4 text-sm text-red-600">
							Couldn't load holidays. Refresh to try again.
						</p>
					) : rows.length === 0 ? (
						<p className="p-4 text-sm text-slate-500">
							No holidays for {year} yet. Add the dates once the UAE government
							publishes them; until then estimates only skip weekends.
						</p>
					) : (
						<>
							<table className="min-w-full text-sm" data-stack="md">
								<thead>
									<tr className="border-b text-left text-xs uppercase text-slate-500">
										<th className="px-4 py-2">Date</th>
										<th className="px-4 py-2">Name</th>
										<th className="px-4 py-2">Arabic</th>
										<th className="px-4 py-2">Status</th>
										<th className="px-4 py-2">Active</th>
										<th className="px-4 py-2 text-right">Actions</th>
									</tr>
								</thead>
								<tbody>
									{rows.map((h) => (
										<HolidayRow key={h.id} holiday={h} />
									))}
								</tbody>
							</table>
							<p className="border-t p-3 text-xs text-slate-500">
								{rows.length} {rows.length === 1 ? "holiday" : "holidays"} in{" "}
								{year} · {estimates} marked as estimates
							</p>
						</>
					)}
				</CardContent>
			</Card>
		</div>
	);
}

function HolidayRow({ holiday }: { holiday: PublicHoliday }) {
	const update = useUpdatePublicHoliday();
	const del = useDeletePublicHoliday();
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState({
		holiday_date: holiday.holiday_date,
		name: holiday.name,
		name_ar: holiday.name_ar ?? "",
	});

	const patch = async (
		p: Parameters<typeof update.mutateAsync>[0]["patch"],
		done: string,
	) => {
		try {
			await update.mutateAsync({ id: holiday.id, patch: p });
			toast({ title: done });
			return true;
		} catch (err) {
			toast({
				title: "Couldn't save",
				description: errorMessage(err, "Try again."),
				variant: "destructive",
			});
			return false;
		}
	};

	if (editing) {
		return (
			<tr className="border-b bg-slate-50">
				<td className="px-4 py-2" data-label="Date">
					<Input
						type="date"
						aria-label="Date"
						value={draft.holiday_date}
						onChange={(e) =>
							setDraft({ ...draft, holiday_date: e.target.value })
						}
					/>
				</td>
				<td className="px-4 py-2" data-label="Name">
					<Input
						aria-label="Name"
						value={draft.name}
						onChange={(e) => setDraft({ ...draft, name: e.target.value })}
					/>
				</td>
				<td className="px-4 py-2" data-label="Arabic">
					<Input
						aria-label="Arabic name"
						dir="rtl"
						lang="ar"
						value={draft.name_ar}
						onChange={(e) => setDraft({ ...draft, name_ar: e.target.value })}
					/>
				</td>
				<td colSpan={3} className="space-x-2 px-4 py-2 text-right">
					<Button
						size="sm"
						disabled={
							update.isPending || !draft.name.trim() || !draft.holiday_date
						}
						onClick={async () => {
							if (
								await patch(
									{ ...draft, name_ar: draft.name_ar || null },
									"Holiday updated",
								)
							)
								setEditing(false);
						}}
					>
						Save
					</Button>
					<Button size="sm" variant="outline" onClick={() => setEditing(false)}>
						Cancel
					</Button>
				</td>
			</tr>
		);
	}

	return (
		<tr className={holiday.is_active ? "border-b" : "border-b text-slate-400"}>
			<td className="px-4 py-2 font-mono tabular-nums" data-card-title>
				{holiday.holiday_date}{" "}
				<span className="text-slate-500">{weekday(holiday.holiday_date)}</span>
			</td>
			<td className="px-4 py-2" data-label="Name">
				{holiday.name}
			</td>
			<td className="px-4 py-2" data-label="Arabic" dir="rtl" lang="ar">
				{holiday.name_ar ?? "—"}
			</td>
			<td className="px-4 py-2" data-label="Status">
				<button
					type="button"
					className="rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
					onClick={() =>
						patch(
							{ is_estimate: !holiday.is_estimate },
							holiday.is_estimate
								? "Marked as confirmed"
								: "Marked as estimate",
						)
					}
					title={holiday.is_estimate ? "Mark as confirmed" : "Mark as estimate"}
				>
					{holiday.is_estimate ? (
						<Badge variant="warning">Estimate</Badge>
					) : (
						<Badge variant="success">Confirmed</Badge>
					)}
				</button>
			</td>
			<td className="px-4 py-2" data-label="Active">
				<Switch
					checked={holiday.is_active}
					aria-label={`Skip ${holiday.name} in estimates`}
					onCheckedChange={(v) =>
						patch({ is_active: v }, v ? "Holiday enabled" : "Holiday disabled")
					}
				/>
			</td>
			<td className="space-x-1 px-4 py-2 text-right">
				<Button
					size="sm"
					variant="ghost"
					onClick={() => setEditing(true)}
					aria-label={`Edit ${holiday.name}`}
				>
					<Pencil className="h-4 w-4" aria-hidden="true" />
				</Button>
				<Button
					size="sm"
					variant="ghost"
					aria-label={`Delete ${holiday.name} on ${holiday.holiday_date}`}
					onClick={async () => {
						if (
							!window.confirm(
								`Delete ${holiday.name} on ${holiday.holiday_date}?`,
							)
						)
							return;
						try {
							await del.mutateAsync(holiday.id);
							toast({ title: "Holiday deleted" });
						} catch (err) {
							toast({
								title: "Couldn't delete",
								description: errorMessage(err, "Try again."),
								variant: "destructive",
							});
						}
					}}
				>
					<Trash2 className="h-4 w-4" aria-hidden="true" />
				</Button>
			</td>
		</tr>
	);
}
