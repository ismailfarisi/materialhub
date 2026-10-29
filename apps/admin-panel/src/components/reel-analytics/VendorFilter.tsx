"use client";
import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

type VendorLite = { id: string; business_name: string };

export function VendorFilter({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (id: string | undefined) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ["admin-vendor-search", query],
    queryFn: async () => {
      const { data } = await api.get("/admin/vendors", {
        params: { search: query, limit: 10 },
      });
      return (data.data?.data ?? data.data ?? []) as VendorLite[];
    },
    enabled: query.length >= 2 && open,
  });
  return (
    <div className="flex items-center gap-2 relative">
      <label htmlFor="vendor-filter-search" className="text-xs text-taupe">
        Vendor filter:
      </label>
      {value ? (
        <button
          type="button"
          className="text-xs bg-muted rounded-md px-2 py-1"
          onClick={() => {
            onChange(undefined);
            setQuery("");
          }}
        >
          ✕ Clear
        </button>
      ) : null}
      <input
        id="vendor-filter-search"
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search vendors…"
        className="text-sm border rounded-md px-2 py-1 w-56"
      />
      {open && data && data.length > 0 && (
        <div className="absolute z-10 mt-8 top-full right-0 bg-linen border rounded-md shadow">
          {data.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => {
                onChange(v.id);
                setQuery(v.business_name);
                setOpen(false);
              }}
              className="block w-full text-left px-3 py-1.5 text-sm hover:bg-muted"
            >
              {v.business_name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
