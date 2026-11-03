"use client";

import { useDialogFocus } from "@/components/cart/use-dialog-focus";
import { PhoneVerifyField, saveAddressErrorMessage } from "@/components/account/phone-verify-field";
import { Button } from "@/components/swatch";
import { UAE_EMIRATES } from "@/lib/emirates";
import { useAddresses, useCreateAddress, useUpdateAddress } from "@/lib/queries/account";
import { cn } from "@/lib/utils";
import { useCheckoutStore } from "@/stores/checkout";
import { ChevronDown, Loader2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { Notice } from "./checkout-ui";

const EMPTY_FORM = {
	full_name: "",
	phone: "",
	building_name: "",
	floor: "",
	apartment: "",
	street: "",
	area: "",
	city: "",
	emirate: "",
};

type FieldKey = keyof typeof EMPTY_FORM;
type CheckoutKey = Parameters<ReturnType<typeof useTranslations<"checkout">>>[0];

const FIELD_CLASS =
	"h-11 w-full rounded-md border border-nl-cacao/20 bg-nl-pearl px-3.5 text-[15px] text-nl-cacao outline-none transition-[border-color,box-shadow] duration-150 hover:border-nl-cacao/40 focus:border-nl-cacao focus-visible:shadow-[0_0_0_2px_hsl(var(--nl-amber)/0.9)]";

// Form-state keys (snake_case for API) mapped to i18n keys under "checkout".
// `half` pairs short fields side by side from `sm` up.
const FIELDS: { key: FieldKey; labelKey: CheckoutKey; required: boolean; type?: "phone" | "emirate"; half?: boolean; autoComplete?: string }[] = [
	{ key: "full_name", labelKey: "addressField.fullName", required: true, autoComplete: "name" },
	{ key: "phone", labelKey: "addressField.phone", required: true, type: "phone" },
	{ key: "building_name", labelKey: "addressField.buildingName", required: true, autoComplete: "address-line1" },
	{ key: "floor", labelKey: "addressField.floor", required: false, half: true },
	{ key: "apartment", labelKey: "addressField.apartment", required: false, half: true, autoComplete: "address-line2" },
	{ key: "street", labelKey: "addressField.street", required: true, autoComplete: "street-address" },
	{ key: "area", labelKey: "addressField.area", required: false, half: true, autoComplete: "address-level3" },
	{ key: "city", labelKey: "addressField.city", required: true, half: true, autoComplete: "address-level2" },
	{ key: "emirate", labelKey: "addressField.emirate", required: true, type: "emirate" },
];

export function AddressDrawer() {
	const t = useTranslations("checkout");
	const tEmirates = useTranslations("emirates");
	const { isAddressDrawerOpen, editingAddressId, setAddressDrawerOpen, setSelectedAddressId } = useCheckoutStore();
	const { data: addresses } = useAddresses();
	const createAddress = useCreateAddress();
	const updateAddress = useUpdateAddress();
	const panelRef = useRef<HTMLElement>(null);

	const [form, setForm] = useState(EMPTY_FORM);
	const [saving, setSaving] = useState(false);
	const [phoneVerified, setPhoneVerified] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);
	// The address's phone as stored, captured once per open/edit — unlike
	// `form.phone`, this does NOT track keystrokes, so PhoneVerifyField can tell
	// "still the original number" (grandfathered, backend never gates it) from
	// "user changed it" (gated, same as creating a new address).
	const [originalPhone, setOriginalPhone] = useState<string | undefined>(undefined);

	const isEditing = !!editingAddressId;
	const close = useCallback(() => setAddressDrawerOpen(false), [setAddressDrawerOpen]);
	useDialogFocus(isAddressDrawerOpen, panelRef, close);

	useEffect(() => {
		setSaveError(null);
		if (isEditing && addresses) {
			const addr = addresses.find((a: { id: string }) => a.id === editingAddressId);
			if (addr) {
				setForm({
					full_name: addr.full_name || "",
					phone: addr.phone || "",
					building_name: addr.building_name || "",
					floor: addr.floor || "",
					apartment: addr.apartment || "",
					street: addr.street || "",
					area: addr.area || "",
					city: addr.city || "",
					emirate: addr.emirate || "",
				});
				setOriginalPhone(addr.phone || undefined);
				return;
			}
		}
		setForm(EMPTY_FORM);
		setOriginalPhone(undefined);
	}, [isEditing, editingAddressId, addresses]);

	if (!isAddressDrawerOpen) return null;

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setSaving(true);
		setSaveError(null);
		try {
			if (isEditing && editingAddressId) {
				await updateAddress.mutateAsync({ id: editingAddressId, ...form });
				setAddressDrawerOpen(false);
			} else {
				const saved = await createAddress.mutateAsync(form);
				if (saved?.id) {
					setSelectedAddressId(saved.id);
				}
				setAddressDrawerOpen(false);
			}
		} catch (err) {
			// A stale client-side "verified" gate can still be rejected server-side
			// (403 PHONE_NOT_VERIFIED) — surface that readably instead of a silent
			// failure, since the customer is mid-checkout here.
			setSaveError(saveAddressErrorMessage(err) ?? t("addressSaveFailed"));
		} finally {
			setSaving(false);
		}
	}

	function handleField(field: FieldKey, value: string) {
		setForm((prev) => ({ ...prev, [field]: value }));
	}

	const missingRequired = FIELDS.some((f) => f.required && !form[f.key]);
	const title = isEditing ? t("editAddressTitle") : t("addAddressTitle");

	return (
		<>
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: pointer-only backdrop; Escape closes via useDialogFocus */}
			<div aria-hidden="true" onClick={close} className="fixed inset-0 z-[60] bg-nl-espresso/50" />
			{/* biome-ignore lint/a11y/useSemanticElements: native <dialog> top-layer/backdrop semantics conflict with this slide-over */}
			<aside
				role="dialog"
				ref={panelRef}
				aria-modal="true"
				aria-labelledby="address-drawer-title"
				className="fixed inset-y-0 end-0 z-[60] flex w-full max-w-md flex-col bg-nl-pearl text-nl-cacao shadow-lift"
			>
				<header className="flex items-center justify-between gap-3 border-b border-nl-cacao/10 px-5 py-4 sm:px-6">
					<h2 id="address-drawer-title" className="m-0 font-display text-xl font-semibold tracking-[-0.02em]">
						{title}
					</h2>
					<Button variant="ghost" size="icon" onClick={close} aria-label={t("close")}>
						<X className="h-5 w-5" strokeWidth={1.75} />
					</Button>
				</header>

				<form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
					<div className="grid flex-1 grid-cols-2 content-start gap-x-3 gap-y-4 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
						{FIELDS.map(({ key, labelKey, required, type, half, autoComplete }) => {
							const id = `address-${key}`;
							return (
								<div key={key} className={cn("grid gap-1.5", half ? "col-span-2 sm:col-span-1" : "col-span-2")}>
									<label htmlFor={id} className="text-[13px] font-medium text-nl-cacao">
										{t(labelKey)}
										{required ? (
											<span aria-hidden="true" className="ms-0.5 text-destructive">
												*
											</span>
										) : (
											<span className="ms-1.5 font-normal text-nl-russet">{t("optional")}</span>
										)}
									</label>
									{type === "phone" ? (
										<PhoneVerifyField
											id={id}
											value={form[key]}
											onChange={(phone) => handleField(key, phone)}
											onVerifiedChange={setPhoneVerified}
											originalPhone={originalPhone}
											required={required}
											className="flex items-center rounded-md border border-nl-cacao/20 bg-nl-pearl px-3.5 transition-colors hover:border-nl-cacao/40 focus-within:border-nl-cacao focus-within:shadow-[0_0_0_2px_hsl(var(--nl-amber)/0.9)]"
											prefixClassName="me-2 font-mono text-[14px] text-nl-russet"
											inputClassName="h-11 w-full bg-transparent font-mono text-[15px] text-nl-cacao outline-none"
										/>
									) : type === "emirate" ? (
										<div className="relative">
											<select
												id={id}
												value={form[key]}
												onChange={(e) => handleField(key, e.target.value)}
												required={required}
												autoComplete="address-level1"
												className={cn(FIELD_CLASS, "appearance-none pe-10", !form[key] && "text-nl-russet")}
											>
												<option value="" disabled>
													{t("chooseEmirate")}
												</option>
												{UAE_EMIRATES.map((em) => (
													<option key={em.value} value={em.value}>
														{tEmirates(em.labelKey)}
													</option>
												))}
											</select>
											<ChevronDown
												className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-nl-russet"
												strokeWidth={1.75}
												aria-hidden="true"
											/>
										</div>
									) : (
										<input
											id={id}
											type="text"
											value={form[key]}
											onChange={(e) => handleField(key, e.target.value)}
											required={required}
											autoComplete={autoComplete}
											className={FIELD_CLASS}
										/>
									)}
								</div>
							);
						})}
						{saveError && (
							<div className="col-span-2">
								<Notice tone="error" live>
									{saveError}
								</Notice>
							</div>
						)}
					</div>

					<footer className="grid gap-2 border-t border-nl-cacao/10 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:px-6">
						{!phoneVerified && form.phone && (
							<p className="m-0 text-[12.5px] text-nl-russet">{t("verifyPhoneFirst")}</p>
						)}
						<Button type="submit" variant="primary" size="lg" disabled={saving || missingRequired || !phoneVerified}>
							{saving && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
							{saving ? t("saving") : t("saveAddressCta")}
						</Button>
					</footer>
				</form>
			</aside>
		</>
	);
}
