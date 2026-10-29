export interface ShipToAddress {
  name: string;
  address_line_1: string;
  address_line_2?: string | null;
  // UAE unit fields captured on the customer address. Carried through so the
  // carrier adapter can surface them (building → BuildingNameOrNumber, apartment
  // + floor folded into the address line). Absent on hub/gift shipments.
  building_name?: string | null;
  apartment?: string | null;
  floor?: string | null;
  city: string;
  emirate?: string | null;
  country_code?: string;
  phone?: string | null;
  is_hub: boolean;
}

export function resolveShipTo(args: {
  giftOrderId: string | null;
  hub: {
    name: string;
    address_line_1: string;
    address_line_2: string | null;
    city: string;
    emirate: string;
    country_code: string;
    contact_phone: string | null;
  } | null;
  customerAddress: Record<string, any>;
}): ShipToAddress {
  if (args.giftOrderId && args.hub) {
    return {
      name: args.hub.name,
      address_line_1: args.hub.address_line_1,
      address_line_2: args.hub.address_line_2,
      city: args.hub.city,
      emirate: args.hub.emirate,
      country_code: args.hub.country_code,
      phone: args.hub.contact_phone,
      is_hub: true,
    };
  }
  const a = args.customerAddress ?? {};
  return {
    name: a.name ?? a.full_name ?? "",
    address_line_1: a.address_line_1 ?? a.line1 ?? "",
    address_line_2: a.address_line_2 ?? a.line2 ?? null,
    building_name: a.building_name ?? null,
    apartment: a.apartment ?? null,
    floor: a.floor ?? null,
    city: a.city ?? "",
    emirate: a.emirate ?? a.state ?? null,
    country_code: a.country_code ?? "AE",
    phone: a.phone ?? null,
    is_hub: false,
  };
}
