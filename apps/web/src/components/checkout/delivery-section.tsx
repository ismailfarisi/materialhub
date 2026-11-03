"use client";

import { Button } from "@/components/swatch";
import { UAE_EMIRATES } from "@/lib/emirates";
import { useAddresses } from "@/lib/queries/account";
import { useCheckoutStore } from "@/stores/checkout";
import { MapPin, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { OptionTile, Panel } from "./checkout-ui";

interface Address {
	id: string;
	full_name?: string | null;
	phone?: string | null;
	building_name?: string | null;
	apartment?: string | null;
	floor?: string | null;
	street?: string | null;
	area?: string | null;
	city?: string | null;
	emirate?: string | null;
	is_default?: boolean;
}

/** Step 1: choose or add the delivery address. */
export function DeliverySection() {
	const t = useTranslations("checkout");
	const tEmirates = useTranslations("emirates");
	const { selectedAddressId, setSelectedAddressId, setAddressDrawerOpen } = useCheckoutStore();
	const { data, isLoading } = useAddresses();
	const addresses = (data ?? []) as Address[];

	useEffect(() => {
		if (addresses.length === 0 || selectedAddressId) return;
		const defaultAddr = addresses.find((a) => a.is_default) || addresses[0];
		if (defaultAddr?.id) setSelectedAddressId(defaultAddr.id);
	}, [addresses, selectedAddressId, setSelectedAddressId]);

	const emirateLabel = (value?: string | null) => {
		const known = UAE_EMIRATES.find((e) => e.value === value);
		return known ? tEmirates(known.labelKey) : (value ?? "");
	};

	return (
		<Panel id="checkout-address" step={1} done={!!selectedAddressId} title={t("addressTitle")}>
			{isLoading ? (
				<div className="grid gap-2 rounded-md border border-nl-cacao/12 p-4 animate-pulse motion-reduce:animate-none" aria-hidden="true">
					<div className="h-4 w-1/3 rounded-sm bg-nl-cacao/[0.07]" />
					<div className="h-3.5 w-2/3 rounded-sm bg-nl-cacao/[0.07]" />
				</div>
			) : addresses.length === 0 ? (
				<div className="grid justify-items-start gap-3 rounded-md border border-dashed border-nl-cacao/30 bg-nl-linen/50 p-4 sm:p-5">
					<MapPin className="h-5 w-5 text-nl-cacao" strokeWidth={1.75} aria-hidden="true" />
					<div className="grid gap-1">
						<p className="m-0 font-medium text-nl-cacao">{t("noAddressTitle")}</p>
						<p className="m-0 text-[14px] text-nl-russet">{t("noAddressBody")}</p>
					</div>
					<Button variant="primary" onClick={() => setAddressDrawerOpen(true)}>
						<Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
						{t("addAddress")}
					</Button>
				</div>
			) : (
				<div className="grid gap-2.5">
					<div role="radiogroup" aria-label={t("addressTitle")} className="grid gap-2.5">
						{addresses.map((addr) => {
							const line1 = [addr.building_name, addr.apartment, addr.floor].filter(Boolean).join(", ");
							const emirate = emirateLabel(addr.emirate);
							const line2 = [addr.street, addr.area, addr.city, emirate !== addr.city ? emirate : null]
								.filter(Boolean)
								.join(", ");
							return (
								<div key={addr.id} className="relative">
									<OptionTile
										name="checkout-address"
										value={addr.id}
										checked={selectedAddressId === addr.id}
										onSelect={() => setSelectedAddressId(addr.id)}
										className="pe-20"
									>
										<span className="flex flex-wrap items-center gap-2">
											<span className="font-medium text-nl-cacao break-words [unicode-bidi:plaintext]">{addr.full_name}</span>
											{addr.is_default && (
												<span className="mill-label inline-flex h-5 items-center rounded-sm bg-nl-linen px-1.5 text-nl-russet">
													{t("defaultTag")}
												</span>
											)}
										</span>
										<span className="mt-1 block text-[13.5px] leading-relaxed text-nl-russet break-words [unicode-bidi:plaintext]">
											{line1 && (
												<>
													{line1}
													<br />
												</>
											)}
											{line2}
										</span>
										{addr.phone && (
											<span dir="ltr" className="mt-1 block font-mono text-[12.5px] tabular-nums text-nl-russet text-start">
												{addr.phone}
											</span>
										)}
									</OptionTile>
									<button
										type="button"
										onClick={() => setAddressDrawerOpen(true, addr.id)}
										aria-label={t("editAddressFor", { name: addr.full_name ?? "" })}
										className="absolute end-2 top-2 inline-flex h-9 items-center rounded-md px-2.5 text-[13px] font-medium text-nl-cacao underline decoration-nl-cacao/25 underline-offset-4 hover:bg-nl-cacao/[0.06] hover:decoration-nl-cacao focus-visible:outline focus-visible:outline-2 focus-visible:outline-nl-amber"
									>
										{t("edit")}
									</button>
								</div>
							);
						})}
					</div>
					<Button variant="outline" onClick={() => setAddressDrawerOpen(true)} className="justify-self-start">
						<Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
						{t("addAnotherAddress")}
					</Button>
				</div>
			)}
		</Panel>
	);
}
