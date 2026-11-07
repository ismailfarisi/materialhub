import { validateTrn } from "./trn";

export const EMIRATES = [
	"Abu Dhabi",
	"Dubai",
	"Sharjah",
	"Ajman",
	"Umm Al Quwain",
	"Ras Al Khaimah",
	"Fujairah",
] as const;

export interface VendorApplyForm {
	storeName: string;
	email: string;
	phone: string;
	street: string;
	city: string;
	emirate: string;
	trn: string;
}

export type VendorApplyErrors = Partial<Record<keyof VendorApplyForm | "licence", string>>;

/** Field errors for the application form; empty when it can be submitted. */
export function validateVendorApply(
	v: VendorApplyForm,
	licenceKey: string | null,
): VendorApplyErrors {
	const e: VendorApplyErrors = {};
	if (v.storeName.trim().length < 2) e.storeName = "Enter your store or trading name.";
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) e.email = "Enter a valid email.";
	if (v.phone.replace(/[^\d]/g, "").length < 7) e.phone = "Enter a phone number buyers can reach.";
	if (!v.street.trim()) e.street = "Enter the street or area.";
	if (!v.city.trim()) e.city = "Enter the city.";
	if (!(EMIRATES as readonly string[]).includes(v.emirate)) e.emirate = "Pick an emirate.";
	const trn = validateTrn(v.trn);
	if (!trn.ok) e.trn = trn.error;
	if (!licenceKey) e.licence = "Upload your trade licence.";
	return e;
}

/** POST /vendors/apply body. Bank details are added later in Settings. */
export function buildVendorApplyPayload(v: VendorApplyForm, licenceKey: string, fileName: string) {
	const trn = validateTrn(v.trn);
	return {
		business_name: v.storeName.trim(),
		business_email: v.email.trim(),
		business_phone: v.phone.trim(),
		business_address: {
			street: v.street.trim(),
			city: v.city.trim(),
			state: v.emirate,
			country: "AE",
		},
		...(trn.ok && trn.value ? { tax_registration_number: trn.value } : {}),
		documents: [{ type: "trade_license", s3_key: licenceKey, file_name: fileName }],
	};
}
