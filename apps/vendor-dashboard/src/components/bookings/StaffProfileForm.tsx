"use client";

import {
	type StaffMember,
	type StaffMemberInput,
	useCreateStaff,
	useUpdateStaff,
} from "@/lib/queries/staff";
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
	Switch,
	Textarea,
	toast,
} from "@materialhub/ui";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";

const staffFormSchema = z.object({
	name: z.string().min(1, "Name is required").max(255),
	avatar_url: z.string().max(2048).optional(),
	bio: z.string().max(5000).optional(),
	is_active: z.boolean(),
});

type StaffFormValues = z.infer<typeof staffFormSchema>;

function defaultsFor(staff?: StaffMember): StaffFormValues {
	if (!staff) {
		return { name: "", avatar_url: "", bio: "", is_active: true };
	}
	return {
		name: staff.name,
		avatar_url: staff.avatar_url ?? "",
		bio: staff.bio ?? "",
		is_active: staff.is_active,
	};
}

function buildPayload(values: StaffFormValues, isEdit: boolean): StaffMemberInput {
	const payload: StaffMemberInput = {
		name: values.name.trim(),
		is_active: values.is_active,
	};
	if (values.avatar_url?.trim()) {
		payload.avatar_url = values.avatar_url.trim();
	} else if (isEdit) {
		payload.avatar_url = null;
	}
	if (values.bio?.trim()) {
		payload.bio = values.bio.trim();
	} else if (isEdit) {
		payload.bio = null;
	}
	return payload;
}

interface StaffProfileFormProps {
	staff?: StaffMember;
	canWrite: boolean;
	// After create, the page decides where to go next (staff detail); after
	// edit, this form just stays in place (no navigation).
	onCreated?: (staff: StaffMember) => void;
}

export function StaffProfileForm({ staff, canWrite, onCreated }: StaffProfileFormProps) {
	const router = useRouter();
	const isEdit = !!staff;

	const { mutateAsync: createStaff, isPending: creating } = useCreateStaff();
	const { mutateAsync: updateStaff, isPending: updating } = useUpdateStaff();
	const isPending = creating || updating;

	const form = useForm<StaffFormValues>({
		resolver: zodResolver(staffFormSchema),
		defaultValues: defaultsFor(staff),
	});

	async function onSubmit(values: StaffFormValues) {
		try {
			const payload = buildPayload(values, isEdit);
			if (isEdit && staff) {
				await updateStaff({ id: staff.id, payload });
				toast({ title: "Staff profile updated" });
			} else {
				const created = await createStaff(payload);
				toast({ title: "Staff member created" });
				if (onCreated) {
					onCreated(created);
					return;
				}
				router.push(`/staff/${created.id}`);
			}
		} catch (err: unknown) {
			const e = err as { response?: { data?: { message?: string } } };
			toast({
				title: "Could not save staff member",
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
						You have read-only access to Staff. Ask an owner or manager to make
						changes.
					</div>
				)}

				<fieldset disabled={!canWrite} className="contents space-y-6">
					<Card>
						<CardHeader>
							<CardTitle>Profile</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							<FormField
								control={form.control}
								name="name"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Name *</FormLabel>
										<Input placeholder="e.g. Sara Al Marri" {...field} />
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="avatar_url"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Avatar URL</FormLabel>
										<Input placeholder="https://…" {...field} />
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="bio"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Bio</FormLabel>
										<Textarea rows={4} placeholder="Short bio…" {...field} />
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
													Inactive staff can't be booked or assigned new
													slots.
												</p>
											</div>
											<Switch checked={field.value} onCheckedChange={field.onChange} />
										</FormItem>
									)}
								/>
							)}
						</CardContent>
					</Card>
				</fieldset>

				{canWrite && (
					<div className="flex gap-2">
						<Button type="submit" disabled={isPending}>
							{isPending ? "Saving…" : isEdit ? "Save Changes" : "Create Staff Member"}
						</Button>
						<Button
							type="button"
							variant="outline"
							onClick={() => router.push("/staff")}
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
