"use client";

import { api } from "@/lib/api";
import { getMembershipsFromToken } from "@/lib/auth";
import { useMe } from "@/lib/queries/auth";
import { loginUrl } from "@/lib/return-to";
import { uploadErrorMessage } from "@/lib/upload-error";
import { WEB_URL } from "@/lib/urls";
import {
	EMIRATES,
	type VendorApplyErrors,
	type VendorApplyForm,
	buildVendorApplyPayload,
	validateVendorApply,
} from "@/lib/vendor-apply";
import { useAuthStore } from "@/stores/auth";
import {
	Button,
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
	Input,
	Label,
} from "@materialhub/ui";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";


/** Presign (user-scoped business_licence), PUT to storage, return the key. */
async function uploadLicence(file: File): Promise<string> {
	const { data } = await api.post("/media/presign", {
		asset_type: "business_licence",
		filename: file.name,
		content_type: file.type,
	});
	const { uploadUrl, key } = (data?.data ?? data) as { uploadUrl: string; key: string };
	const res = await fetch(uploadUrl, {
		method: "PUT",
		body: file,
		headers: { "Content-Type": file.type },
	});
	if (!res.ok) throw new Error(`upload failed: ${res.status}`);
	return key;
}

function Field({
	id,
	label,
	error,
	children,
}: {
	id: string;
	label: string;
	error?: string;
	children: React.ReactNode;
}) {
	return (
		<div>
			<Label htmlFor={id} className="text-sm font-medium">
				{label}
			</Label>
			<div className="mt-1">{children}</div>
			{error ? (
				<p id={`${id}-error`} className="mt-1 text-xs text-destructive">
					{error}
				</p>
			) : null}
		</div>
	);
}

export default function ApplyPage() {
	const me = useMe();
	const user = useAuthStore((s) => s.user);
	const [hasStore, setHasStore] = useState(false);
	useEffect(() => {
		setHasStore(getMembershipsFromToken().length > 0);
	}, []);

	const [form, setForm] = useState<VendorApplyForm>({
		storeName: "",
		email: "",
		phone: "",
		street: "",
		city: "",
		emirate: "Dubai",
		trn: "",
	});
	const [errors, setErrors] = useState<VendorApplyErrors>({});
	const [licence, setLicence] = useState<{ key: string; name: string } | null>(null);
	const [uploading, setUploading] = useState(false);
	const [uploadError, setUploadError] = useState<string | null>(null);

	useEffect(() => {
		if (user?.email) setForm((f) => (f.email ? f : { ...f, email: user.email }));
	}, [user?.email]);

	const submit = useMutation({
		mutationFn: async () => {
			if (!licence) throw new Error("Upload your trade licence.");
			const { data } = await api.post(
				"/vendors/apply",
				buildVendorApplyPayload(form, licence.key, licence.name),
			);
			return data.data;
		},
	});

	const set = (k: keyof VendorApplyForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
		setForm((f) => ({ ...f, [k]: e.target.value }));

	async function onLicence(file: File | undefined) {
		if (!file) return;
		setUploadError(null);
		setUploading(true);
		try {
			const key = await uploadLicence(file);
			setLicence({ key, name: file.name });
			setErrors((e) => ({ ...e, licence: undefined }));
		} catch (err) {
			setLicence(null);
			setUploadError(uploadErrorMessage(err));
		} finally {
			setUploading(false);
		}
	}

	function onSubmit(e: React.FormEvent) {
		e.preventDefault();
		const next = validateVendorApply(form, licence?.key ?? null);
		setErrors(next);
		if (Object.keys(next).length === 0) submit.mutate();
	}

	let body: React.ReactNode;
	if (me.isLoading) {
		body = <p className="text-sm text-muted-foreground">Checking your sign-in…</p>;
	} else if (!user) {
		body = (
			<div className="space-y-3">
				<p className="text-sm text-muted-foreground">
					Sign in with your MaterialHub account to apply. New to MaterialHub? Create a buyer
					account on the storefront first, then come back here.
				</p>
				<div className="flex flex-wrap gap-2">
					<Button asChild>
						<Link href={loginUrl("/apply")}>Sign in to apply</Link>
					</Button>
					<Button asChild variant="outline">
						<a href={`${WEB_URL}/en/auth/register`}>Create an account</a>
					</Button>
				</div>
			</div>
		);
	} else if (hasStore) {
		body = (
			<div className="space-y-3">
				<p className="text-sm text-muted-foreground">
					{user.email} already belongs to a vendor team.
				</p>
				<Button asChild>
					<Link href="/">Go to your dashboard</Link>
				</Button>
			</div>
		);
	} else if (submit.isSuccess) {
		body = (
			<div role="status" className="space-y-2">
				<p className="font-medium">Application received</p>
				<p className="text-sm text-muted-foreground">
					MaterialHub will review {form.storeName.trim()} and email {form.email.trim()} with the
					decision. Once approved, sign in here to set up your store, bank details and products.
				</p>
			</div>
		);
	} else {
		const apiError = submit.error as
			| { response?: { status?: number; data?: { message?: string } } }
			| null;
		body = (
			<form onSubmit={onSubmit} noValidate className="space-y-4">
				<Field id="store-name" label="Store or trading name" error={errors.storeName}>
					<Input
						id="store-name"
						value={form.storeName}
						onChange={set("storeName")}
						placeholder="e.g. Al Quoz Board & Paper Trading"
						autoComplete="organization"
					/>
				</Field>
				<div className="grid gap-4 sm:grid-cols-2">
					<Field id="email" label="Business email" error={errors.email}>
						<Input id="email" type="email" value={form.email} onChange={set("email")} autoComplete="email" />
					</Field>
					<Field id="phone" label="Phone" error={errors.phone}>
						<Input
							id="phone"
							type="tel"
							value={form.phone}
							onChange={set("phone")}
							placeholder="+971 50 123 4567"
							autoComplete="tel"
						/>
					</Field>
				</div>
				<Field id="street" label="Street / area" error={errors.street}>
					<Input
						id="street"
						value={form.street}
						onChange={set("street")}
						placeholder="Warehouse 12, Al Quoz Industrial 3"
						autoComplete="street-address"
					/>
				</Field>
				<div className="grid gap-4 sm:grid-cols-2">
					<Field id="city" label="City" error={errors.city}>
						<Input id="city" value={form.city} onChange={set("city")} autoComplete="address-level2" />
					</Field>
					<Field id="emirate" label="Emirate" error={errors.emirate}>
						<select
							id="emirate"
							value={form.emirate}
							onChange={set("emirate")}
							className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
						>
							{EMIRATES.map((e) => (
								<option key={e} value={e}>
									{e}
								</option>
							))}
						</select>
					</Field>
				</div>
				<Field id="trn" label="TRN (optional, 15 digits)" error={errors.trn}>
					<Input
						id="trn"
						inputMode="numeric"
						value={form.trn}
						onChange={set("trn")}
						placeholder="100123456700003"
					/>
				</Field>
				<Field id="licence" label="Trade licence (PDF, JPG or PNG, up to 10 MB)" error={errors.licence}>
					<input
						id="licence"
						type="file"
						accept="application/pdf,image/jpeg,image/png"
						disabled={uploading}
						onChange={(e) => void onLicence(e.target.files?.[0])}
						className="block w-full text-sm"
					/>
					{uploading ? <p className="mt-1 text-xs text-muted-foreground">Uploading…</p> : null}
					{licence && !uploading ? (
						<p className="mt-1 text-xs text-muted-foreground">Uploaded: {licence.name}</p>
					) : null}
					{uploadError ? (
						<p role="alert" className="mt-1 text-xs text-destructive">
							{uploadError}
						</p>
					) : null}
				</Field>
				{submit.isError ? (
					<p role="alert" className="text-sm text-destructive">
						{apiError?.response?.status === 409
							? "You already have an application with MaterialHub. We will email you once it is reviewed."
							: (apiError?.response?.data?.message ?? "The application could not be sent. Try again.")}
					</p>
				) : null}
				<Button type="submit" className="w-full" disabled={submit.isPending || uploading}>
					{submit.isPending ? "Sending…" : "Send application"}
				</Button>
				<p className="text-xs text-muted-foreground">
					Bank details for payouts are added after approval, under Settings.
				</p>
			</form>
		);
	}

	return (
		<div className="grid min-h-screen place-items-center px-4 py-8">
			<Card className="w-full max-w-xl">
				<CardHeader>
					<CardTitle>Apply to sell on MaterialHub</CardTitle>
					<CardDescription>
						Papers, boards, leather, fittings, packaging and craft supplies. We review every
						supplier before the store opens.
					</CardDescription>
				</CardHeader>
				<CardContent>{body}</CardContent>
			</Card>
			<p className="mt-4 text-center text-xs text-pearl/70">
				Already approved? <Link href="/login" className="underline">Sign in</Link>
			</p>
		</div>
	);
}
