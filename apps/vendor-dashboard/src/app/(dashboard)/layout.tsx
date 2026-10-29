"use client";

import { VendorPicker } from "@/components/header/vendor-picker";
import { getMembershipsFromToken } from "@/lib/auth";
import { useChangePassword, useLogout, useMe } from "@/lib/queries/auth";
import { useVendorServices } from "@/lib/queries/offerings";
import { useAuthStore } from "@/stores/auth";
import {
	ChangePasswordDialog,
	DashboardHeader,
	Sidebar,
	toast,
} from "@materialhub/ui";
import {
	ArrowCounterClockwise,
	CalendarBlank,
	CalendarCheck,
	Certificate,
	ChartBar,
	FileText,
	FilmSlate,
	Gavel,
	Gear,
	Handshake,
	IdentificationCard,
	Lightning,
	ListChecks,
	MapPin,
	Megaphone,
	Package,
	Plug,
	ShoppingCart,
	SquaresFour,
	Storefront,
	Tag,
	Truck,
	Users,
	UsersThree,
	VideoCamera,
	Wallet,
} from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

// Bookings nav group (Task 4: Services only). Tasks 5-7 append their own
// entries to this array — do not restructure it, just push more
// { label, href, icon } objects (Calendar, Staff, Locations, Hours,
// Settings) in the order they should appear under "Bookings".
const BOOKINGS_NAV_ITEMS = [
	// Task 6: Calendar — the daily-driver front-desk screen, placed first
	// since it's what a vendor opens most (day/week grid of all engagements,
	// quick actions) — see task-6-report.md.
	{ label: "Calendar", href: "/calendar", icon: <CalendarBlank size={20} /> },
	{ label: "Services", href: "/services", icon: <ListChecks size={20} /> },
	// Task 5: Locations (branches + service-areas) and Staff (profile, branch/
	// service links, weekly hours, time off) — see task-5-report.md.
	{ label: "Locations", href: "/locations", icon: <MapPin size={20} /> },
	{ label: "Staff", href: "/staff", icon: <UsersThree size={20} /> },
];

const dashboardItem = {
	label: "Dashboard",
	href: "/",
	icon: <SquaresFour size={20} />,
};

const ordersGroup = {
	label: "Orders & Fulfillment",
	icon: <ShoppingCart size={20} />,
	children: [
		{ label: "Orders", href: "/orders", icon: <ShoppingCart size={20} /> },
		{
			label: "Returns",
			href: "/returns",
			icon: <ArrowCounterClockwise size={20} />,
		},
	],
};

const catalogGroup = {
	label: "Catalog & Inventory",
	icon: <Package size={20} />,
	children: [
		{ label: "Products", href: "/products", icon: <Package size={20} /> },
		{
			label: "Bulk Inventory",
			href: "/bulk/inventory",
			icon: <Package size={20} />,
		},
		{
			label: "Bulk Catalog",
			href: "/bulk/catalog",
			icon: <FileText size={20} />,
		},
	],
};

const marketingGroup = {
	label: "Marketing & Growth",
	icon: <Tag size={20} />,
	children: [
		{ label: "Coupons", href: "/coupons", icon: <Tag size={20} /> },
		{
			label: "Flash Deals",
			href: "/flash-deals",
			icon: <Lightning size={20} />,
		},
		{
			label: "Affiliates",
			href: "/affiliates",
			icon: <Handshake size={20} />,
		},
		{ label: "Bids", href: "/bids", icon: <Gavel size={20} /> },
	],
};

const creatorStudioGroup = {
	label: "Creator Studio",
	icon: <VideoCamera size={20} />,
	children: [
		{ label: "Reels", href: "/reels", icon: <FilmSlate size={20} /> },
		{
			label: "Reel Analytics",
			href: "/reels-analytics",
			icon: <ChartBar size={20} />,
		},
		{
			label: "Creator Content",
			href: "/creator-content",
			icon: <VideoCamera size={20} />,
		},
		{
			label: "Creators",
			href: "/creators",
			icon: <IdentificationCard size={20} />,
		},
		{
			label: "Collaborations",
			href: "/collabs",
			icon: <Megaphone size={20} />,
		},
		{
			label: "UGC Licensing",
			href: "/licensing",
			icon: <Certificate size={20} />,
		},
	],
};

const channelsGroup = {
	label: "Storefront & Integrations",
	icon: <Storefront size={20} />,
	children: [
		{
			label: "Storefront",
			href: "/cms/storefront",
			icon: <Storefront size={20} />,
		},
		{
			label: "Integrations",
			href: "/integrations",
			icon: <Plug size={20} />,
		},
	],
};

const financeItem = {
	label: "Payouts",
	href: "/payouts",
	icon: <Wallet size={20} />,
};

const settingsGroup = {
	label: "Settings & Team",
	icon: <Gear size={20} />,
	children: [
		{
			label: "Store Settings",
			href: "/settings",
			icon: <Gear size={20} />,
		},
		{
			label: "Shipping Integrations",
			href: "/settings/shipping-integrations",
			icon: <Truck size={20} />,
		},
		...(process.env.NEXT_PUBLIC_TEAM_MANAGEMENT_ENABLED !== "false"
			? [{ label: "Team", href: "/team", icon: <Users size={20} /> }]
			: []),
	],
};

function getBreadcrumbs(pathname: string) {
	const segments = pathname.split("/").filter(Boolean);
	if (segments.length === 0) return [{ label: "Dashboard" }];
	return [
		{ label: "Dashboard", href: "/" },
		...segments.map((seg, i) => ({
			label: seg.charAt(0).toUpperCase() + seg.slice(1),
			href:
				i < segments.length - 1
					? `/${segments.slice(0, i + 1).join("/")}`
					: undefined,
		})),
	];
}

export default function DashboardLayout({
	children,
}: { children: React.ReactNode }) {
	const router = useRouter();
	const pathname = usePathname();
	const [collapsed, setCollapsed] = useState(false);
	const [mobileOpen, setMobileOpen] = useState(false);

	const { isLoading: isQueryLoading, isError } = useMe();
	const { mutate: logout } = useLogout();
	const queryClient = useQueryClient();
	const changePassword = useChangePassword();
	const [pwOpen, setPwOpen] = useState(false);
	const [pwError, setPwError] = useState<{ code?: string; message?: string }>(
		{},
	);
	const user = useAuthStore((s) => s.user);
	const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
	const isStoreLoading = useAuthStore((s) => s.isLoading);

	const isLoading = isQueryLoading || isStoreLoading;

	// Capability-gated Bookings nav (see .superpowers/sdd/task-4-brief.md):
	// only fetch once auth has resolved and the user actually has a vendor
	// membership (the endpoint 400s MISSING_ACTIVE_VENDOR for a bare
	// admin/super_admin session with zero memberships).
	const memberships = isAuthenticated ? getMembershipsFromToken() : [];
	const isVendorScoped = memberships.length > 0;
	const { data: offerings } = useVendorServices({
		enabled: !isLoading && isAuthenticated && isVendorScoped,
	});
	const hasOfferings = (offerings?.length ?? 0) > 0;

	const navItems = useMemo(() => {
		const bookingsEntry = hasOfferings
			? [
					{
						label: "Bookings & Services",
						icon: <CalendarCheck size={20} />,
						children: BOOKINGS_NAV_ITEMS,
					},
				]
			: isVendorScoped
				? [
						{
							label: "Add Services",
							href: "/services",
							icon: <ListChecks size={20} />,
						},
					]
				: [];

		return [
			dashboardItem,
			ordersGroup,
			catalogGroup,
			...bookingsEntry,
			marketingGroup,
			creatorStudioGroup,
			channelsGroup,
			financeItem,
			settingsGroup,
		];
	}, [hasOfferings, isVendorScoped]);

	useEffect(() => {
		if (!isLoading && (!isAuthenticated || isError)) {
			router.replace("/login");
		}
	}, [isLoading, isAuthenticated, isError, router]);

	useEffect(() => {
		if (user?.must_change_password) setPwOpen(true);
	}, [user?.must_change_password]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: closes mobile nav on route changes.
	useEffect(() => {
		setMobileOpen(false);
	}, [pathname]);

	useEffect(() => {
		if (!isLoading && isAuthenticated && user) {
			// Phase 3a: vendor users have role='customer' plus a vendor_members row.
			// Allow super_admin/admin (for impersonation flows) and any role with at
			// least one active vendor membership; reject everyone else.
			const memberships = getMembershipsFromToken();
			const isVendorScoped = memberships.length > 0;
			const isAdminScoped =
				user.role === "super_admin" || user.role === "admin";
			if (!isVendorScoped && !isAdminScoped) {
				router.replace("/login");
			}
		}
	}, [isLoading, isAuthenticated, user, router]);

	const handleChangePassword = async (vals: {
		current_password: string;
		new_password: string;
	}) => {
		setPwError({});
		try {
			await changePassword.mutateAsync(vals);
			toast({
				title: "Password changed",
				description: "Please sign in again.",
			});
			useAuthStore.getState().logout();
			queryClient.clear();
			router.replace("/login");
		} catch (err: unknown) {
			const e = err as {
				response?: { data?: { code?: string; message?: string } };
			};
			const code = e?.response?.data?.code;
			const message = e?.response?.data?.message;
			setPwError({
				code: code ?? "UNKNOWN",
				message: message ?? "Could not change password. Please try again.",
			});
		}
	};

	if (isLoading) {
		return (
			<div className="min-h-screen flex items-center justify-center">
				<div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
			</div>
		);
	}

	if (!isAuthenticated || !user) {
		return null;
	}

	const breadcrumbs = getBreadcrumbs(pathname);
	const userName = `${user.first_name} ${user.last_name}`.trim() || user.email;

	return (
		<div className="flex h-screen overflow-hidden">
			<Sidebar
				items={navItems}
				currentPath={pathname}
				collapsed={collapsed}
				onToggle={() => setCollapsed((c) => !c)}
				appName="MaterialHub"
				roleBadge="Vendor"
				mobileOpen={mobileOpen}
				onMobileClose={() => setMobileOpen(false)}
			/>
			<div className="flex flex-col flex-1 overflow-hidden">
				<DashboardHeader
					breadcrumbs={breadcrumbs}
					user={{ name: userName, avatar: user.avatar_url, role: "Vendor" }}
					onLogout={() =>
						logout(undefined, { onSuccess: () => router.replace("/login") })
					}
					onChangePassword={() => setPwOpen(true)}
					onMenuClick={() => setMobileOpen(true)}
				/>
				<div className="flex items-center justify-end px-4 lg:px-6 py-2 border-b border-pearl/14 empty:hidden">
					<VendorPicker />
				</div>
				<main className="flex-1 overflow-y-auto p-4 lg:p-6 -ml-px">
					{children}
				</main>
				<ChangePasswordDialog
					open={pwOpen}
					onOpenChange={(v) => {
						if (user?.must_change_password) return;
						setPwOpen(v);
						if (!v) setPwError({});
					}}
					onSubmit={handleChangePassword}
					isPending={changePassword.isPending}
					errorCode={pwError.code}
					errorMessage={pwError.message}
					forced={!!user?.must_change_password}
				/>
			</div>
		</div>
	);
}
