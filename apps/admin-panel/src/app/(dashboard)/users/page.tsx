"use client";

import {
  useChangeUserRole,
  useUpdateUserStatus,
  useUsers,
} from "@/lib/queries/users";
import { useAuthStore } from "@/stores/auth";
import {
  Button,
  DataTable,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  FiltersBar,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  StatusBadge,
} from "@materialhub/ui";
import { toast } from "@materialhub/ui";
import { useDebounce } from "@materialhub/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone?: string | null;
  role: string;
  status: string;
  created_at: string;
}

const ROLE_OPTIONS = [
  { label: "Super Admin", value: "super_admin" },
  { label: "Admin", value: "admin" },
  { label: "Vendor", value: "vendor" },
  { label: "Customer", value: "customer" },
  { label: "Guest", value: "guest" },
];

const STATUS_OPTIONS = [
  { label: "Active", value: "active" },
  { label: "Suspended", value: "suspended" },
  { label: "Inactive", value: "inactive" },
];


const ROLE_COLOR_MAP: Record<string, string> = {
  super_admin: "bg-purple-100 text-purple-700",
  admin: "bg-blue-100 text-amber",
  vendor: "bg-orange-100 text-orange-700",
  customer: "bg-green-100 text-green-700",
  guest: "bg-pearl/100 text-taupe",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-AE", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function UsersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user: currentUser } = useAuthStore();
  const isSuperAdmin = currentUser?.role === "super_admin";

  const searchParam = searchParams.get("search") ?? "";
  const roleFilter = searchParams.get("role") ?? "__all__";
  const statusFilter = searchParams.get("status") ?? "__all__";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const pagination = useMemo(() => ({ pageIndex: page - 1, pageSize: 20 }), [page]);

  const updateParam = useCallback(
    (updates: Record<string, string | null | undefined>, resetPage = true) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value && value !== "__all__") params.set(key, value);
        else params.delete(key);
      }
      if (resetPage && !updates.page) params.delete("page");
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false });
    },
    [router, searchParams],
  );

  const [search, setSearch] = useState(searchParam);
  useEffect(() => {
    setSearch(searchParam);
  }, [searchParam]);

  const debouncedSearch = useDebounce(search, 400);
  useEffect(() => {
    if (debouncedSearch !== searchParam) {
      updateParam({ search: debouncedSearch || null }, true);
    }
  }, [debouncedSearch, searchParam, updateParam]);

  const { data, isLoading } = useUsers({
    search: searchParam || undefined,
    role: roleFilter,
    status: statusFilter,
    page,
    limit: pagination.pageSize,
  });

  const { mutate: updateStatus } = useUpdateUserStatus();
  const { mutate: changeRole } = useChangeUserRole();

  const users: User[] = data?.users ?? data?.items ?? [];
  const total: number = data?.total ?? 0;
  const pageCount = Math.ceil(total / pagination.pageSize) || 1;

  function handleStatusChange(userId: string, status: string) {
    updateStatus(
      { id: userId, status },
      {
        onSuccess: () => toast({ title: "Status updated" }),
        onError: () =>
          toast({
            title: "Error",
            description: "Failed to update status.",
            variant: "destructive",
          }),
      },
    );
  }

  function handleRoleChange(userId: string, role: string) {
    changeRole(
      { id: userId, role },
      {
        onSuccess: () => toast({ title: "Role updated" }),
        onError: () =>
          toast({ title: "Error", description: "Failed to update role.", variant: "destructive" }),
      },
    );
  }


  const columns: ColumnDef<User>[] = [
    {
      accessorKey: "email",
      header: "Email",
      cell: ({ row }) => (
        <Link
          href={`/users/${row.original.id}`}
          className="font-medium text-cacao hover:text-primary hover:underline"
        >
          {row.original.email}
        </Link>
      ),
    },
    {
      id: "name",
      header: "Name",
      cell: ({ row }) => {
        const name = [row.original.first_name, row.original.last_name].filter(Boolean).join(" ");
        return <span className="text-cacao">{name || "—"}</span>;
      },
    },
    {
      accessorKey: "phone",
      header: "Phone",
      cell: ({ row }) => (
        <span className="text-cacao font-mono text-xs">{row.original.phone || "—"}</span>
      ),
    },
    {
      accessorKey: "role",
      header: "Role",
      cell: ({ row }) => <StatusBadge status={row.original.role} colorMap={ROLE_COLOR_MAP} />,
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },

    {
      accessorKey: "created_at",
      header: "Joined",
      cell: ({ row }) => formatDate(row.original.created_at),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const user = row.original;
        return (
          <div className="flex items-center gap-2 justify-end">
            {/* Role selector — super_admin only */}
            {isSuperAdmin && (
              <Select value={user.role} onValueChange={(val) => handleRoleChange(user.id, val)}>
                <SelectTrigger className="w-[140px] h-8 text-xs">
                  <SelectValue placeholder="Change role" />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} className="text-xs">
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}


            {/* Status dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="w-8 h-8 p-0">
                  <MoreHorizontal size={16} />
                  <span className="sr-only">Actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel className="text-xs text-taupe">Change Status</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {STATUS_OPTIONS.map((opt) => (
                  <DropdownMenuItem
                    key={opt.value}
                    onClick={() => handleStatusChange(user.id, opt.value)}
                    className={user.status === opt.value ? "font-semibold" : ""}
                  >
                    {opt.label}
                    {user.status === opt.value && <span className="ml-auto text-primary">✓</span>}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-cacao mb-1">Users</h1>
        <p className="text-taupe text-sm">Manage platform user accounts, roles, and statuses.</p>
      </div>

      <FiltersBar
        search={{
          placeholder: "Search by name, email, or phone...",
          value: search,
          onChange: (v) => setSearch(v),
        }}
        filters={[
          {
            key: "role",
            label: "Role",
            options: ROLE_OPTIONS,
            value: roleFilter,
            onChange: (v) => updateParam({ role: v }),
          },
          {
            key: "status",
            label: "Status",
            options: STATUS_OPTIONS,
            value: statusFilter,
            onChange: (v) => updateParam({ status: v }),
          },
        ]}
      />

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((id) => (
            <Skeleton key={id} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={users}
          isLoading={isLoading}
          pagination={pagination}
          pageCount={pageCount}
          totalCount={total}
          itemLabel="users"
          onPaginationChange={(updater) => {
            const next = typeof updater === "function" ? updater(pagination) : updater;
            updateParam({ page: next.pageIndex > 0 ? String(next.pageIndex + 1) : null }, false);
          }}
        />
      )}
    </div>
  );
}
