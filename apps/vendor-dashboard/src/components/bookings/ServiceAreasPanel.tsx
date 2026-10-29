"use client";

import {
	useCreateServiceArea,
	useDeleteServiceArea,
	useDeliveryZones,
	useServiceAreas,
} from "@/lib/queries/locations";
import {
	Button,
	EmptyState,
	Input,
	Label,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	toast,
} from "@materialhub/ui";
import { MapTrifold, Trash } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { z } from "zod";

// Fix-cycle-1 finding M-2 — the DTO (`CreateServiceAreaBody.travel_buffer_minutes`)
// is `Type.Integer({ minimum: 0 })`; validate the same constraint client-side
// with a friendly message instead of letting a decimal/negative value 400
// with the generic error-toast fallback. `z.coerce.number()` maps a blank
// string to 0 (matching the previous `Number(buffer) || 0` default).
const travelBufferSchema = z.coerce
	.number()
	.int("Travel buffer must be a whole number of minutes.")
	.min(0, "Travel buffer must be 0 or greater.");

// Vendor-wide home-visit coverage (task-5-brief.md: service_areas has no
// location_id — it's not tied to a specific branch). Area choices come from
// the public delivery-zones list.
export function ServiceAreasPanel({ canWrite }: { canWrite: boolean }) {
	const { data: areas = [], isLoading: loadingAreas } = useServiceAreas();
	const { data: zones = [], isLoading: loadingZones } = useDeliveryZones();
	const createArea = useCreateServiceArea();
	const deleteArea = useDeleteServiceArea();

	const [selectedZone, setSelectedZone] = useState("");
	const [buffer, setBuffer] = useState("0");

	const zoneName = useMemo(() => {
		const map = new Map(zones.map((zone) => [zone.id, `${zone.name} (${zone.city})`]));
		return (areaId: string) => map.get(areaId) ?? areaId;
	}, [zones]);

	const availableZones = useMemo(
		() => zones.filter((zone) => !areas.some((a) => a.area_id === zone.id)),
		[zones, areas],
	);

	async function addArea() {
		if (!selectedZone) return;
		// The `<Input type="number" min={0}>` HTML attribute isn't
		// form-validated (the Add button isn't a native type="submit"), so a
		// decimal or negative value could otherwise reach the DTO's
		// `Type.Integer({minimum:0})` and 400 with the generic fallback toast.
		const parsedBuffer = travelBufferSchema.safeParse(buffer);
		if (!parsedBuffer.success) {
			toast({
				title: "Invalid travel buffer",
				description: parsedBuffer.error.issues[0]?.message ?? "Please enter a valid number.",
				variant: "destructive",
			});
			return;
		}
		try {
			await createArea.mutateAsync({
				area_id: selectedZone,
				travel_buffer_minutes: parsedBuffer.data,
			});
			toast({ title: "Service area added" });
			setSelectedZone("");
			setBuffer("0");
		} catch (err: unknown) {
			const e = err as { response?: { status?: number; data?: { message?: string } } };
			// Fix-cycle-1 finding M-1 — the backend now maps the duplicate
			// (vendor_id, area_id) unique-violation to a 409 ConflictError;
			// surface a clear "already added" message instead of the generic
			// fallback. (`availableZones` below already excludes already-added
			// zones from the picker in normal single-tab use, so this mostly
			// covers the two-tabs/stale-cache race the review flagged.)
			const isConflict = e?.response?.status === 409;
			toast({
				title: isConflict ? "Zone already added" : "Could not add service area",
				description: isConflict
					? "This zone is already part of your service coverage."
					: (e?.response?.data?.message ?? "Please try again."),
				variant: "destructive",
			});
		}
	}

	async function removeArea(id: string) {
		try {
			await deleteArea.mutateAsync(id);
			toast({ title: "Service area removed" });
		} catch (err: unknown) {
			const e = err as { response?: { data?: { message?: string } } };
			toast({
				title: "Could not remove service area",
				description: e?.response?.data?.message ?? "Please try again.",
				variant: "destructive",
			});
		}
	}

	const isLoading = loadingAreas || loadingZones;

	return (
		<div className="space-y-4">
			<p className="text-sm text-taupe">
				Zones your staff will travel to for home-visit services. Offerings with
				location mode "Home visit" or "Either" only surface slots for customers
				inside a covered zone.
			</p>

			{canWrite && (
				<div className="flex items-end gap-2 rounded-lg border border-pearl/28 p-3">
					<div className="flex-1">
						<Label className="mb-1 block text-xs">Zone</Label>
						<Select value={selectedZone} onValueChange={setSelectedZone}>
							<SelectTrigger>
								<SelectValue placeholder="Select a zone" />
							</SelectTrigger>
							<SelectContent>
								{availableZones.map((zone) => (
									<SelectItem key={zone.id} value={zone.id}>
										{zone.name} ({zone.city})
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="w-40">
						<Label className="mb-1 block text-xs">Travel buffer (min)</Label>
						<Input
							type="number"
							min={0}
							step={1}
							value={buffer}
							onChange={(e) => setBuffer(e.target.value)}
						/>
					</div>
					<Button
						type="button"
						onClick={addArea}
						disabled={!selectedZone || createArea.isPending}
					>
						Add
					</Button>
				</div>
			)}

			{!isLoading && areas.length === 0 ? (
				<EmptyState
					icon={<MapTrifold size={40} />}
					title="No service areas yet"
					description={
						canWrite
							? "Add zones you'll travel to for home-visit bookings."
							: "This vendor hasn't configured any home-visit coverage yet."
					}
				/>
			) : (
				<div className="rounded-lg border border-pearl/14 divide-y divide-pearl/14">
					{areas.map((area) => (
						<div key={area.id} className="flex items-center justify-between px-4 py-3">
							<div>
								<p className="text-sm font-medium">{zoneName(area.area_id)}</p>
								<p className="text-xs text-muted-foreground">
									Travel buffer: {area.travel_buffer_minutes} min
								</p>
							</div>
							{canWrite && (
								<Button
									variant="ghost"
									size="sm"
									aria-label="Remove service area"
									onClick={() => removeArea(area.id)}
									disabled={deleteArea.isPending}
								>
									<Trash size={16} />
								</Button>
							)}
						</div>
					))}
				</div>
			)}
		</div>
	);
}
