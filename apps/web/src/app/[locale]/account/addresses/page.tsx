"use client";

import type { AddressRow } from "@/components/account/types";
import { AddressForm } from "@/components/account/address-form";
import { EmptyState, ErrorState, ListSkeleton, PageHeader, Panel, PanelHead, StatusBadge } from "@/components/account/account-ui";
import { Button } from "@/components/swatch";
import { useAddresses, useCreateAddress, useDeleteAddress, useUpdateAddress } from "@/lib/queries/account";
import { MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

export default function AddressesPage() {
	const t = useTranslations("account");
	const tCommon = useTranslations("common");
	const { data: addresses, isLoading, isError, refetch } = useAddresses();
	const createAddress = useCreateAddress();
	const updateAddress = useUpdateAddress();
	const deleteAddress = useDeleteAddress();
	const [showForm, setShowForm] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const list: AddressRow[] = addresses || [];

	const openNew = () => {
		setShowForm(true);
		setEditingId(null);
	};

	return (
		<div>
			<PageHeader
				title={t("addresses")}
				description={t("addressesIntro")}
				action={
					!showForm && list.length > 0 ? (
						<Button variant="outline" onClick={openNew}>
							<Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
							{tCommon("addAddress")}
						</Button>
					) : null
				}
			/>

			{showForm && !editingId && (
				<Panel className="mb-4">
					<PanelHead title={t("newAddress")} />
					<div className="p-4 md:p-5">
						<AddressForm
							onSubmit={async (data) => {
								await createAddress.mutateAsync(data);
								setShowForm(false);
							}}
							onCancel={() => setShowForm(false)}
							isLoading={createAddress.isPending}
						/>
					</div>
				</Panel>
			)}

			{isLoading ? (
				<ListSkeleton rows={2} />
			) : isError ? (
				<ErrorState onRetry={() => refetch()} />
			) : list.length === 0 ? (
				!showForm && (
					<EmptyState
						icon={MapPin}
						title={t("addressesEmptyTitle")}
						body={t("addressesEmptyBody")}
						action={{ label: tCommon("addAddress"), onClick: openNew }}
					/>
				)
			) : (
				<ul className="m-0 grid list-none gap-3 p-0 md:grid-cols-2">
					{list.map((addr) => (
						<Panel as="li" key={addr.id} className={editingId === addr.id ? "md:col-span-2" : undefined}>
							{editingId === addr.id ? (
								<>
									<PanelHead title={t("editAddress")} />
									<div className="p-4 md:p-5">
										<AddressForm
											initial={addr}
											onSubmit={async (data) => {
												await updateAddress.mutateAsync({ id: addr.id, ...data });
												setEditingId(null);
											}}
											onCancel={() => setEditingId(null)}
											isLoading={updateAddress.isPending}
										/>
									</div>
								</>
							) : (
								<div className="flex h-full flex-col">
									<div className="grid flex-1 gap-1 p-4 md:p-5">
										<div className="flex flex-wrap items-center gap-2">
											<p className="m-0 break-words font-display text-[15.5px] font-semibold text-nl-cacao">{addr.full_name}</p>
											{addr.is_default && <StatusBadge tone="neutral">{t("defaultAddress")}</StatusBadge>}
										</div>
										<address className="grid gap-0.5 text-sm not-italic text-nl-russet">
											<span className="break-words">
												{[addr.building_name, addr.apartment, addr.floor].filter(Boolean).join(", ")}
											</span>
											<span className="break-words">{[addr.street, addr.area].filter(Boolean).join(", ")}</span>
											<span className="break-words">{[addr.city, addr.emirate].filter(Boolean).join(", ")}</span>
											{addr.phone && (
												<span dir="ltr" className="font-mono text-[13px] tabular-nums text-nl-cacao rtl:text-end">
													{addr.phone}
												</span>
											)}
										</address>
									</div>
									<div className="flex gap-1 border-t border-nl-cacao/10 px-2 py-1.5">
										<Button variant="ghost" size="sm" onClick={() => { setEditingId(addr.id); setShowForm(false); }}>
											<Pencil className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
											{tCommon("edit")}
										</Button>
										<Button
											variant="ghost"
											size="sm"
											className="text-nl-russet hover:text-destructive"
											disabled={deleteAddress.isPending && deleteAddress.variables === addr.id}
											onClick={() => {
												if (confirm(tCommon("deleteConfirm"))) deleteAddress.mutate(addr.id);
											}}
										>
											<Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
											{tCommon("delete")}
										</Button>
									</div>
								</div>
							)}
						</Panel>
					))}
				</ul>
			)}
		</div>
	);
}
