"use client";
import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

interface VendorRow {
  id: string;
  business_name: string;
}

interface AdminVendorsResponse {
  statusCode: number;
  data: {
    data: VendorRow[];
    total: number;
    page: number;
    limit: number;
  };
  timestamp: string;
}

export function VendorSelector({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string) => void;
}) {
  const { data } = useQuery({
    queryKey: ["vendors-for-bulk"],
    queryFn: async () => {
      const { data } = await api.get<AdminVendorsResponse>("/admin/vendors", {
        params: { status: "approved", limit: 500 },
      });
      return data.data.data;
    },
  });
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className="rounded border px-3 py-2 text-sm"
    >
      <option value="">Select vendor…</option>
      {data?.map((v) => (
        <option key={v.id} value={v.id}>
          {v.business_name}
        </option>
      ))}
    </select>
  );
}
