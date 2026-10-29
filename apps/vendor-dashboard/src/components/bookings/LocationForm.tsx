"use client";

import {
	type VendorLocation,
	type VendorLocationInput,
	useCreateLocation,
	useDeliveryZones,
	useUpdateLocation,
} from "@/lib/queries/locations";
import { zodResolver } from "@hookform/resolvers/zod";
import {
	Button,
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	Form,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
	Input,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	Switch,
	toast,
} from "@materialhub/ui";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const NO_ZONE = "__none__";

// Fix-cycle-1 finding I-2 — a freeform text input let a typo (e.g.
// "Asia/Dubay") pass client validation (only a min/max length check) and
// reach the backend, where an invalid IANA zone previously 500'd the
// storefront's public availability endpoint. A select removes typos
// entirely; Gulf/common markets first, Asia/Dubai default.
const TIMEZONE_OPTIONS: Array<{ value: string; label: string }> = [
	{ value: "Asia/Dubai", label: "Asia/Dubai (UAE)" },
	{ value: "Asia/Riyadh", label: "Asia/Riyadh (Saudi Arabia)" },
	{ value: "Asia/Qatar", label: "Asia/Qatar" },
	{ value: "Asia/Kuwait", label: "Asia/Kuwait" },
	{ value: "Asia/Bahrain", label: "Asia/Bahrain" },
	{ value: "Asia/Muscat", label: "Asia/Muscat (Oman)" },
	{ value: "Asia/Baghdad", label: "Asia/Baghdad (Iraq)" },
	{ value: "Asia/Amman", label: "Asia/Amman (Jordan)" },
	{ value: "Asia/Beirut", label: "Asia/Beirut (Lebanon)" },
	{ value: "Africa/Cairo", label: "Africa/Cairo (Egypt)" },
	{ value: "Asia/Kolkata", label: "Asia/Kolkata (India)" },
	{ value: "Asia/Karachi", label: "Asia/Karachi (Pakistan)" },
	{ value: "Asia/Dhaka", label: "Asia/Dhaka (Bangladesh)" },
	{ value: "Asia/Colombo", label: "Asia/Colombo (Sri Lanka)" },
	{ value: "Asia/Manila", label: "Asia/Manila (Philippines)" },
	{ value: "UTC", label: "UTC" },
];

const locationFormSchema = z.object({
	name: z.string().min(1, "Name is required").max(255),
	street: z.string().max(255).optional(),
	area: z.string().max(255).optional(),
	city: z.string().max(255).optional(),
	emirate: z.string().max(255).optional(),
	// Plain strings, not z.coerce.number() — coercing "" would silently become 0
	// (Number("") === 0), which would submit lat/lng 0,0 for a blank field
	// instead of leaving them unset. Parsed + range-checked in buildPayload.
	lat: z.string().refine((v) => {
		if (!v.trim()) return true;
		const n = Number(v);
		return Number.isFinite(n) && n >= -90 && n <= 90;
	}, "Latitude must be between -90 and 90"),
	lng: z.string().refine((v) => {
		if (!v.trim()) return true;
		const n = Number(v);
		return Number.isFinite(n) && n >= -180 && n <= 180;
	}, "Longitude must be between -180 and 180"),
	timezone: z.string().min(1, "Timezone is required").max(64),
	area_id: z.string().optional(),
	is_active: z.boolean(),
});

type LocationFormValues = z.infer<typeof locationFormSchema>;

function defaultsFor(location?: VendorLocation): LocationFormValues {
	if (!location) {
		return {
			name: "",
			street: "",
			area: "",
			city: "",
			emirate: "",
			lat: "",
			lng: "",
			timezone: "Asia/Dubai",
			area_id: NO_ZONE,
			is_active: true,
		};
	}
	return {
		name: location.name,
		street: location.address?.street ?? "",
		area: location.address?.area ?? "",
		city: location.address?.city ?? "",
		emirate: location.address?.emirate ?? "",
		lat: location.lat === null || location.lat === undefined ? "" : String(location.lat),
		lng: location.lng === null || location.lng === undefined ? "" : String(location.lng),
		timezone: location.timezone,
		area_id: location.area_id ?? NO_ZONE,
		is_active: location.is_active,
	};
}

function buildPayload(values: LocationFormValues): VendorLocationInput {
	const address = {
		street: values.street?.trim() || undefined,
		area: values.area?.trim() || undefined,
		city: values.city?.trim() || undefined,
		emirate: values.emirate?.trim() || undefined,
	};
	const hasAddress = Object.values(address).some(Boolean);
	return {
		name: values.name.trim(),
		address: hasAddress ? address : null,
		lat: values.lat.trim() ? Number(values.lat) : null,
		lng: values.lng.trim() ? Number(values.lng) : null,
		timezone: values.timezone.trim(),
		area_id: values.area_id && values.area_id !== NO_ZONE ? values.area_id : null,
		is_active: values.is_active,
	};
}

interface LocationFormProps {
	location?: VendorLocation;
	canWrite: boolean;
}

export function LocationForm({ location, canWrite }: LocationFormProps) {
	const router = useRouter();
	const isEdit = !!location;

	const { mutateAsync: createLocation, isPending: creating } = useCreateLocation();
	const { mutateAsync: updateLocation, isPending: updating } = useUpdateLocation();
	const isPending = creating || updating;
	const { data: zones = [] } = useDeliveryZones();

	const form = useForm<LocationFormValues>({
		resolver: zodResolver(locationFormSchema),
		defaultValues: defaultsFor(location),
	});

	// Include the current value even if it's outside the curated list — an
	// existing location saved (pre-fix) with a nonstandard-but-valid zone
	// shouldn't be silently coerced to a different one just by opening the
	// select.
	const timezoneOptions = useMemo(() => {
		const current = location?.timezone;
		if (current && !TIMEZONE_OPTIONS.some((tz) => tz.value === current)) {
			return [...TIMEZONE_OPTIONS, { value: current, label: `${current} (current)` }];
		}
		return TIMEZONE_OPTIONS;
	}, [location?.timezone]);

	async function onSubmit(values: LocationFormValues) {
		try {
			const payload = buildPayload(values);
			if (isEdit && location) {
				await updateLocation({ id: location.id, payload });
				toast({ title: "Location updated" });
			} else {
				await createLocation(payload);
				toast({ title: "Location created" });
			}
			router.push("/locations");
		} catch (err: unknown) {
			const e = err as { response?: { data?: { message?: string } } };
			toast({
				title: "Could not save location",
				description: e?.response?.data?.message ?? "Please try again.",
				variant: "destructive",
			});
		}
	}

	return (
		<Form {...form}>
			<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 max-w-2xl">
				{!canWrite && (
					<div className="rounded-lg border border-amber/30 bg-amber/10 px-4 py-3 text-sm text-cacao">
						You have read-only access to Locations. Ask an owner or manager to make
						changes.
					</div>
				)}

				<fieldset disabled={!canWrite} className="contents space-y-6">
					<Card>
						<CardHeader>
							<CardTitle>Basics</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							<FormField
								control={form.control}
								name="name"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Name *</FormLabel>
										<Input placeholder="e.g. Downtown Branch" {...field} />
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="timezone"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Timezone</FormLabel>
										<Select value={field.value} onValueChange={field.onChange}>
											<SelectTrigger>
												<SelectValue placeholder="Select a timezone" />
											</SelectTrigger>
											<SelectContent>
												{timezoneOptions.map((tz) => (
													<SelectItem key={tz.value} value={tz.value}>
														{tz.label}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										<FormMessage />
									</FormItem>
								)}
							/>
							{isEdit && (
								<FormField
									control={form.control}
									name="is_active"
									render={({ field }) => (
										<FormItem className="flex items-center justify-between rounded-lg border border-pearl/28 p-3">
											<div>
												<FormLabel>Active</FormLabel>
												<p className="text-xs text-muted-foreground">
													Inactive branches are hidden from the storefront
													and can't be booked. There is no delete — use this
													toggle instead.
												</p>
											</div>
											<Switch checked={field.value} onCheckedChange={field.onChange} />
										</FormItem>
									)}
								/>
							)}
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>Address</CardTitle>
						</CardHeader>
						<CardContent className="grid grid-cols-2 gap-4">
							<FormField
								control={form.control}
								name="street"
								render={({ field }) => (
									<FormItem className="col-span-2">
										<FormLabel>Street</FormLabel>
										<Input placeholder="Street address" {...field} />
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="area"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Area</FormLabel>
										<Input {...field} />
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="city"
								render={({ field }) => (
									<FormItem>
										<FormLabel>City</FormLabel>
										<Input {...field} />
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="emirate"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Emirate</FormLabel>
										<Input {...field} />
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="area_id"
								render={({ field }) => (
									<FormItem className="col-span-2">
										<FormLabel>Zone</FormLabel>
										<Select value={field.value} onValueChange={field.onChange}>
											<SelectTrigger>
												<SelectValue placeholder="Select a zone" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value={NO_ZONE}>No zone</SelectItem>
												{zones.map((z) => (
													<SelectItem key={z.id} value={z.id}>
														{z.name} ({z.city})
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										<p className="text-xs text-muted-foreground">
											Used for zone-based routing — separate from the
											vendor-wide home-visit coverage on the Service Areas
											tab.
										</p>
										<FormMessage />
									</FormItem>
								)}
							/>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>Coordinates</CardTitle>
						</CardHeader>
						<CardContent className="grid grid-cols-2 gap-4">
							<FormField
								control={form.control}
								name="lat"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Latitude</FormLabel>
										<Input type="number" step="0.0000001" {...field} />
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="lng"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Longitude</FormLabel>
										<Input type="number" step="0.0000001" {...field} />
										<FormMessage />
									</FormItem>
								)}
							/>
						</CardContent>
					</Card>
				</fieldset>

				{canWrite && (
					<div className="flex gap-2">
						<Button type="submit" disabled={isPending}>
							{isPending ? "Saving…" : isEdit ? "Save Changes" : "Create Location"}
						</Button>
						<Button
							type="button"
							variant="outline"
							onClick={() => router.push("/locations")}
							disabled={isPending}
						>
							Cancel
						</Button>
					</div>
				)}
			</form>
		</Form>
	);
}
