"use client";

import type { VendorLocation } from "@/lib/queries/locations";
import {
	type WorkingHoursRule,
	useCreateWorkingHours,
	useDeleteWorkingHours,
	useWorkingHours,
} from "@/lib/queries/working-hours";
import {
	Button,
	Input,
	Label,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	toast,
} from "@materialhub/ui";
import { Plus, Trash } from "@phosphor-icons/react";
import { useMemo, useState } from "react";

// Sunday-first — day_of_week 0=Sunday matches the backend's convention
// (WorkingHoursBody, JS Date.getDay()). Times are plain "HH:MM" wall-clock
// strings, local to the staff member's location — never converted through a
// Date/timezone object in this component, per task-5-brief.md.
const DAYS: Array<{ value: number; label: string; short: string }> = [
	{ value: 0, label: "Sunday", short: "Sun" },
	{ value: 1, label: "Monday", short: "Mon" },
	{ value: 2, label: "Tuesday", short: "Tue" },
	{ value: 3, label: "Wednesday", short: "Wed" },
	{ value: 4, label: "Thursday", short: "Thu" },
	{ value: 5, label: "Friday", short: "Fri" },
	{ value: 6, label: "Saturday", short: "Sat" },
];

function truncateSeconds(time: string): string {
	// Rules can come back "HH:MM:SS" from Postgres `time` columns; render HH:MM.
	return time.length > 5 ? time.slice(0, 5) : time;
}

interface DayAddForm {
	start_time: string;
	end_time: string;
	location_id: string;
}

const EMPTY_FORM: DayAddForm = { start_time: "09:00", end_time: "17:00", location_id: "" };

export function WeeklyHoursEditor({
	staffId,
	locations,
	canWrite,
}: {
	staffId: string;
	locations: VendorLocation[];
	canWrite: boolean;
}) {
	const { data: rules = [], isLoading } = useWorkingHours(staffId);
	const createRule = useCreateWorkingHours(staffId);
	const deleteRule = useDeleteWorkingHours(staffId);

	const [addingDay, setAddingDay] = useState<number | null>(null);
	const [form, setForm] = useState<DayAddForm>(EMPTY_FORM);

	const rulesByDay = useMemo(() => {
		const map = new Map<number, WorkingHoursRule[]>();
		for (const day of DAYS) map.set(day.value, []);
		for (const rule of rules) {
			map.get(rule.day_of_week)?.push(rule);
		}
		return map;
	}, [rules]);

	const locationName = useMemo(() => {
		const map = new Map(locations.map((l) => [l.id, l.name]));
		return (id: string | null) => (id ? (map.get(id) ?? "Unknown location") : null);
	}, [locations]);

	function openAdd(day: number) {
		setAddingDay(day);
		setForm(EMPTY_FORM);
	}

	async function submitAdd(day: number) {
		if (!form.start_time || !form.end_time) {
			toast({ title: "Start and end time are required", variant: "destructive" });
			return;
		}
		if (form.start_time >= form.end_time) {
			toast({
				title: "Invalid time range",
				description: "Start time must be before end time.",
				variant: "destructive",
			});
			return;
		}
		try {
			await createRule.mutateAsync({
				day_of_week: day,
				start_time: form.start_time,
				end_time: form.end_time,
				location_id: form.location_id || null,
			});
			toast({ title: "Working-hours rule added" });
			setAddingDay(null);
		} catch (err: unknown) {
			const e = err as { response?: { data?: { message?: string } } };
			toast({
				title: "Could not add rule",
				description: e?.response?.data?.message ?? "Please try again.",
				variant: "destructive",
			});
		}
	}

	async function removeRule(ruleId: string) {
		try {
			await deleteRule.mutateAsync(ruleId);
			toast({ title: "Rule removed" });
		} catch (err: unknown) {
			const e = err as { response?: { data?: { message?: string } } };
			toast({
				title: "Could not remove rule",
				description: e?.response?.data?.message ?? "Please try again.",
				variant: "destructive",
			});
		}
	}

	if (isLoading) {
		return <div className="text-sm text-taupe">Loading…</div>;
	}

	return (
		<div className="space-y-4">
			<p className="text-sm text-taupe">
				Recurring weekly availability. Times are local wall-clock hours (no
				timezone conversion) — split shifts are allowed, just add more than one
				rule for the same day.
			</p>
			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
				{DAYS.map((day) => (
					<div key={day.value} className="rounded-lg border border-pearl/28 p-3 space-y-2">
						<p className="text-xs font-semibold uppercase tracking-wide text-taupe">
							{day.short}
						</p>
						<div className="space-y-2">
							{(rulesByDay.get(day.value) ?? []).map((rule) => (
								<div
									key={rule.id}
									className="rounded-md bg-pearl/10 border border-pearl/20 px-2 py-1.5 text-xs space-y-0.5"
								>
									<div className="flex items-center justify-between gap-1">
										<span className="font-medium text-cacao">
											{truncateSeconds(rule.start_time)}–{truncateSeconds(rule.end_time)}
										</span>
										{canWrite && (
											<button
												type="button"
												aria-label="Delete rule"
												className="text-taupe hover:text-destructive"
												onClick={() => removeRule(rule.id)}
												disabled={deleteRule.isPending}
											>
												<Trash size={12} />
											</button>
										)}
									</div>
									{rule.location_id && (
										<p className="text-muted-foreground truncate">
											{locationName(rule.location_id)}
										</p>
									)}
								</div>
							))}
							{(rulesByDay.get(day.value) ?? []).length === 0 && (
								<p className="text-xs text-muted-foreground">No hours</p>
							)}
						</div>

						{canWrite && addingDay === day.value && (
							<div className="space-y-2 rounded-md border border-amber/30 bg-amber/5 p-2">
								<div>
									<Label className="text-[10px]">Start</Label>
									<Input
										type="time"
										value={form.start_time}
										onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))}
										className="h-8 text-xs"
									/>
								</div>
								<div>
									<Label className="text-[10px]">End</Label>
									<Input
										type="time"
										value={form.end_time}
										onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))}
										className="h-8 text-xs"
									/>
								</div>
								{locations.length > 1 && (
									<div>
										<Label className="text-[10px]">Location</Label>
										<Select
											value={form.location_id || "__any__"}
											onValueChange={(v) =>
												setForm((f) => ({ ...f, location_id: v === "__any__" ? "" : v }))
											}
										>
											<SelectTrigger className="h-8 text-xs">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="__any__">Any location</SelectItem>
												{locations.map((l) => (
													<SelectItem key={l.id} value={l.id}>
														{l.name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
								)}
								<div className="flex gap-1">
									<Button
										type="button"
										size="sm"
										className="h-7 flex-1 text-xs"
										disabled={createRule.isPending}
										onClick={() => submitAdd(day.value)}
									>
										Save
									</Button>
									<Button
										type="button"
										size="sm"
										variant="outline"
										className="h-7 flex-1 text-xs"
										onClick={() => setAddingDay(null)}
									>
										Cancel
									</Button>
								</div>
							</div>
						)}

						{canWrite && addingDay !== day.value && (
							<Button
								type="button"
								variant="outline"
								size="sm"
								className="w-full h-7 text-xs"
								onClick={() => openAdd(day.value)}
							>
								<Plus size={12} className="mr-1" /> Add
							</Button>
						)}
					</div>
				))}
			</div>
		</div>
	);
}
