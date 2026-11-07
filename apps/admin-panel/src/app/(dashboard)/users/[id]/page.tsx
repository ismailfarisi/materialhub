"use client";

import {
  useChangeUserRole,
  useUpdateUserStatus,
  useUser,
} from "@/lib/queries/users";
import { useAuthStore } from "@/stores/auth";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Skeleton,
  StatusBadge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toast,
} from "@materialhub/ui";
import {
  ArrowLeft,
  BadgeCheck,
  Mail,
  MoreHorizontal,
  Phone,
  Wallet,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { AddressesTab } from "./components/AddressesTab";

interface AdminUserDetail {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  phone_verified_at: string | null;
  email_verified_at: string | null;
  role: string;
  status: string;
  avatar_url: string | null;
  preferred_locale: string;
  preferred_currency: string;
  google_id: string | null;
  apple_id: string | null;
  wallet_balance: number;
  wallet_currency: string;
  last_login_at: string | null;
  created_at: string;
}

// The roles an admin may assign (PATCH /admin/users/:id/role). Vendors are
// store memberships, not a user role; "guest" is for anonymous sessions only.
const ROLE_OPTIONS = [
  { label: "Super Admin", value: "super_admin" },
  { label: "Admin", value: "admin" },
  { label: "Customer", value: "customer" },
];

// PATCH /:id/status accepts only these three values.
const STATUS_OPTIONS = [
  { label: "Active", value: "active" },
  { label: "Suspended", value: "suspended" },
  { label: "Pending Verification", value: "pending_verification" },
];


const ROLE_COLOR_MAP: Record<string, string> = {
  super_admin: "bg-purple-100 text-purple-700",
  admin: "bg-blue-100 text-amber",
  customer: "bg-green-100 text-green-700",
  guest: "bg-pearl/100 text-taupe",
};


function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AE", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatMoney(fils: number, currency: string) {
  return `${(fils / 100).toFixed(2)} ${currency}`;
}

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user: currentUser } = useAuthStore();
  const isSuperAdmin = currentUser?.role === "super_admin";

  const { data: user, isLoading } = useUser(id);

  const { mutate: updateStatus, isPending: updatingStatus } =
    useUpdateUserStatus();
  const { mutate: changeRole } = useChangeUserRole();

  function handleStatusChange(status: string) {
    updateStatus(
      { id, status },
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

  function handleRoleChange(role: string) {
    changeRole(
      { id, role },
      {
        onSuccess: () => toast({ title: "Role updated" }),
        onError: () =>
          toast({
            title: "Error",
            description: "Failed to update role.",
            variant: "destructive",
          }),
      },
    );
  }


  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-taupe">User not found.</p>
        <Button variant="outline" onClick={() => router.back()}>
          Go Back
        </Button>
      </div>
    );
  }

  const u = user as AdminUserDetail;
  const fullName =
    [u.first_name, u.last_name].filter(Boolean).join(" ") || "—";
  const initials =
    [u.first_name, u.last_name]
      .filter(Boolean)
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "US";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.back()}
          className="gap-1.5"
        >
          <ArrowLeft size={16} /> Back
        </Button>
        <Separator orientation="vertical" className="h-5" />
        <Avatar className="w-11 h-11 rounded-full">
          {u.avatar_url && <AvatarImage src={u.avatar_url} alt={fullName} />}
          <AvatarFallback className="rounded-full text-sm font-bold">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-cacao">{fullName}</h1>
            <StatusBadge status={u.status} />
          </div>
          <p className="text-taupe text-sm">User ID: {u.id}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Role — super_admin only */}
          {isSuperAdmin && (
            <Select value={u.role} onValueChange={handleRoleChange}>
              <SelectTrigger className="w-[150px] h-9 text-xs">
                <SelectValue placeholder="Change role" />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((opt) => (
                  <SelectItem
                    key={opt.value}
                    value={opt.value}
                    className="text-xs"
                  >
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}


          {/* Status */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-1.5"
                disabled={updatingStatus}
              >
                <MoreHorizontal size={16} /> Status
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="text-xs text-taupe">
                Change Status
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {STATUS_OPTIONS.map((opt) => (
                <DropdownMenuItem
                  key={opt.value}
                  onClick={() => handleStatusChange(opt.value)}
                  className={u.status === opt.value ? "font-semibold" : ""}
                >
                  {opt.label}
                  {u.status === opt.value && (
                    <span className="ml-auto text-primary">✓</span>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="addresses">Addresses</TabsTrigger>
          <TabsTrigger value="wallet">Wallet</TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">
                User Profile
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-taupe mb-0.5">First Name</p>
                  <p className="text-sm font-medium text-cacao">
                    {u.first_name || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-taupe mb-0.5">Last Name</p>
                  <p className="text-sm font-medium text-cacao">
                    {u.last_name || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-taupe mb-0.5">Role</p>
                  <StatusBadge status={u.role} colorMap={ROLE_COLOR_MAP} />
                </div>
                <div className="flex items-start gap-1.5">
                  <Mail size={14} className="text-taupe mt-0.5" />
                  <div>
                    <p className="text-xs text-taupe mb-0.5">Email</p>
                    <p className="text-sm text-cacao flex items-center gap-1">
                      {u.email}
                      {u.email_verified_at ? (
                        <BadgeCheck size={13} className="text-green-600" />
                      ) : (
                        <span className="text-xs text-taupe">(unverified)</span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-1.5">
                  <Phone size={14} className="text-taupe mt-0.5" />
                  <div>
                    <p className="text-xs text-taupe mb-0.5">Phone</p>
                    <p className="text-sm text-cacao flex items-center gap-1">
                      {u.phone ?? "—"}
                      {u.phone && u.phone_verified_at && (
                        <BadgeCheck size={13} className="text-green-600" />
                      )}
                    </p>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-taupe mb-0.5">Status</p>
                  <StatusBadge status={u.status} />
                </div>
                <div>
                  <p className="text-xs text-taupe mb-0.5">Preferred Locale</p>
                  <p className="text-sm text-cacao uppercase">
                    {u.preferred_locale ?? "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-taupe mb-0.5">Preferred Currency</p>
                  <p className="text-sm text-cacao">
                    {u.preferred_currency ?? "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-taupe mb-0.5">Google Linked</p>
                  <p className="text-sm text-cacao">
                    {u.google_id ? "Yes" : "No"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-taupe mb-0.5">Apple Linked</p>
                  <p className="text-sm text-cacao">
                    {u.apple_id ? "Yes" : "No"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-taupe mb-0.5">Joined</p>
                  <p className="text-sm text-cacao">{formatDate(u.created_at)}</p>
                </div>
                <div>
                  <p className="text-xs text-taupe mb-0.5">Last Login</p>
                  <p className="text-sm text-cacao">
                    {formatDate(u.last_login_at)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Addresses Tab */}
        <TabsContent value="addresses" className="mt-4 space-y-4">
          <AddressesTab userId={u.id} />
        </TabsContent>


        {/* Wallet Tab (balance only — ledger is a Future item) */}
        <TabsContent value="wallet" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Wallet</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-amber/15 flex items-center justify-center">
                  <Wallet size={22} className="text-amber" />
                </div>
                <div>
                  <p className="text-xs text-taupe mb-0.5">Balance</p>
                  <p className="text-2xl font-bold text-cacao">
                    {formatMoney(u.wallet_balance ?? 0, u.wallet_currency ?? "AED")}
                  </p>
                </div>
              </div>
              <p className="text-xs text-taupe mt-4">
                Transaction ledger is not available in this view yet.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
