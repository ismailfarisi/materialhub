"use client";

import { api } from "@/lib/api";
import { UAE_EMIRATES } from "@/lib/emirates";
import { useAddresses } from "@/lib/queries/account";
import { useAuthStore } from "@/stores/auth";
import { useCheckoutStore } from "@/stores/checkout";
import { usePreferencesStore } from "@/stores/preferences";
import { useQuery } from "@tanstack/react-query";

/** Used until the buyer picks an emirate or saves an address. Always shown on screen. */
export const FALLBACK_EMIRATE = "Dubai";

interface AddressLike {
	id?: string;
	emirate?: string | null;
	state?: string | null;
	is_default?: boolean;
}

/** Match any stored spelling ("dubai", "abu_dhabi") to a UAE_EMIRATES value. */
export function canonicalEmirate(value?: string | null): string | null {
	if (!value) return null;
	const key = value
		.toLowerCase()
		.replace(/[_-]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	return UAE_EMIRATES.find((e) => e.value.toLowerCase() === key)?.value ?? null;
}

function emirateOf(addr?: AddressLike | null): string | null {
	return canonicalEmirate(addr?.emirate ?? addr?.state ?? null);
}

export type EmirateSource =
	| "checkout_address"
	| "preference"
	| "default_address"
	| "fallback";

/**
 * Pure resolution order: the address chosen at checkout, then the emirate the
 * buyer picked, then their default address, then the fallback.
 */
export function resolveEmirate(input: {
	checkoutAddress?: AddressLike | null;
	preference?: string | null;
	addresses?: AddressLike[] | null;
}): { emirate: string; source: EmirateSource } {
	const fromCheckout = emirateOf(input.checkoutAddress);
	if (fromCheckout)
		return { emirate: fromCheckout, source: "checkout_address" };
	const fromPreference = canonicalEmirate(input.preference);
	if (fromPreference) return { emirate: fromPreference, source: "preference" };
	const list = input.addresses ?? [];
	const fromDefault = emirateOf(list.find((a) => a.is_default) ?? list[0]);
	if (fromDefault) return { emirate: fromDefault, source: "default_address" };
	return { emirate: FALLBACK_EMIRATE, source: "fallback" };
}

/** Signed-in buyers' saved addresses, without probing the API for guests. */
function useSavedAddresses(enabled: boolean) {
	return useQuery({
		queryKey: ["delivery-addresses"],
		queryFn: async () => {
			const { data } = await api.get("/auth/me/addresses");
			return (data?.data ?? []) as AddressLike[];
		},
		enabled,
		staleTime: 5 * 60_000,
		retry: false,
	});
}

/** On checkout: the selected address's emirate (addresses already load there). */
export function useCheckoutEmirate(): string | null {
	const selectedAddressId = useCheckoutStore((s) => s.selectedAddressId);
	const { data } = useAddresses();
	const list = (data ?? []) as AddressLike[];
	return emirateOf(list.find((a) => a.id === selectedAddressId));
}

export function useDeliveryEmirate() {
	const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
	const preference = usePreferencesStore((s) => s.deliveryEmirate);
	const setPreference = usePreferencesStore((s) => s.setDeliveryEmirate);
	const { data: addresses } = useSavedAddresses(isAuthenticated);
	const resolved = resolveEmirate({ preference, addresses });
	return { ...resolved, setEmirate: setPreference };
}
