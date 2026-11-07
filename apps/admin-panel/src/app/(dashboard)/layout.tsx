"use client";

import { api } from "@/lib/api";
import { getBreadcrumbs } from "@/lib/breadcrumbs";
import {
	clearAuthSession,
	isAdminRole,
	useChangePassword,
	useLogout,
	useMe,
} from "@/lib/queries/auth";
import { useAuthStore } from "@/stores/auth";
import {
	ChangePasswordDialog,
	DashboardHeader,
	Sidebar,
	toast,
} from "@materialhub/ui";
import { useQueryClient } from "@tanstack/react-query";
import {
	AlertTriangle,
	CalendarDays,
	Building2,
	ClipboardList,
	Coins,
	CreditCard,
	FileText,
	FolderTree,
	Image,
	LayoutDashboard,
	LayoutGrid,
	Megaphone,
	Menu,
	MessageSquare,
	Package,
	Percent,
	Plug,
	Receipt,
	RotateCcw,
	Settings,
	ShieldCheck,
	ShoppingCart,
	Slack,
	Sliders,
	Sparkles,
	Star,
	Store,
	Tag,
	Truck,
	Users,
	Wallet,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const navItems = [
	{ label: "Dashboard", href: "/", icon: <LayoutDashboard size={20} /> },
	{
		label: "Orders & Operations",
		icon: <ShoppingCart size={20} />,
		children: [
			{ label: "Orders", href: "/orders", icon: <ShoppingCart size={20} /> },
			{ label: "Returns", href: "/returns", icon: <RotateCcw size={20} /> },
			{
				label: "Disputes",
				href: "/disputes",
				icon: <AlertTriangle size={20} />,
			},
			{ label: "Quotes", href: "/quotes", icon: <FileText size={20} /> },
			{
				label: "Cart Abandonment",
				href: "/cart-abandonment",
				icon: <ShoppingCart size={20} />,
			},
		],
	},
	{
		label: "Catalog & Inventory",
		icon: <Package size={20} />,
		children: [
			{
				label: "Products",
				href: "/catalog/products",
				icon: <Package size={20} />,
			},
			{
				label: "Categories",
				href: "/catalog/categories",
				icon: <FolderTree size={20} />,
			},
			{ label: "Brands", href: "/catalog/brands", icon: <Tag size={20} /> },
			{
				label: "Brand Submissions",
				href: "/catalog/brand-submissions",
				icon: <Tag size={20} />,
			},
			{
				label: "Plastic-ban Declarations",
				href: "/catalog/eco-declarations",
				icon: <ShieldCheck size={20} />,
			},
			{
				label: "Attributes",
				href: "/catalog/attributes",
				icon: <Sliders size={20} />,
			},
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
	},
	{
		label: "Vendors & Users",
		icon: <Users size={20} />,
		children: [
			{ label: "Vendors", href: "/vendors", icon: <Store size={20} /> },
			{
				label: "Business Accounts",
				href: "/business-accounts",
				icon: <Building2 size={20} />,
			},
			{ label: "Users", href: "/users", icon: <Users size={20} /> },
		],
	},
	{
		label: "Promotions & Marketing",
		icon: <Megaphone size={20} />,
		children: [
			{ label: "Promotions", href: "/promotions", icon: <Percent size={20} /> },
			{
				label: "Coupons",
				href: "/promotions/coupons",
				icon: <Tag size={20} />,
			},
			{
				label: "Collections",
				href: "/promotions/collections",
				icon: <LayoutGrid size={20} />,
			},
		],
	},
	{
		label: "Content & Channels",
		icon: <FileText size={20} />,
		children: [
			{ label: "Pages", href: "/cms/pages", icon: <FileText size={20} /> },
			{ label: "Banners", href: "/cms/banners", icon: <Image size={20} /> },
			{
				label: "Layouts",
				href: "/cms/layouts",
				icon: <LayoutDashboard size={20} />,
			},
			{ label: "Bids", href: "/cms/bids", icon: <Tag size={20} /> },
			{
				label: "Header Navigation",
				href: "/cms/header-navigation",
				icon: <Menu size={20} />,
			},
			{
				label: "CMS Settings",
				href: "/cms/settings",
				icon: <Settings size={20} />,
			},
			{
				label: "Sales Channels",
				href: "/sales-channels",
				icon: <Megaphone size={20} />,
			},
			{ label: "Customer Reviews", href: "/reviews", icon: <Star size={20} /> },
		],
	},
	{
		label: "Finance",
		icon: <Wallet size={20} />,
		children: [
			{
				label: "Commissions",
				href: "/commissions",
				icon: <Percent size={20} />,
			},
			{ label: "Payouts", href: "/payouts", icon: <Wallet size={20} /> },
			{
				label: "Receivables",
				href: "/receivables",
				icon: <Receipt size={20} />,
			},
		],
	},
	{
		label: "System & Security",
		icon: <ShieldCheck size={20} />,
		children: [
			{
				label: "Support Tickets",
				href: "/support",
				icon: <MessageSquare size={20} />,
			},
			{
				label: "Audit Log",
				href: "/audit-log",
				icon: <ClipboardList size={20} />,
			},
			...(process.env.NEXT_PUBLIC_TEAM_MANAGEMENT_ENABLED === "true"
				? [
						{
							label: "Role Permissions",
							href: "/role-permissions",
							icon: <ShieldCheck size={20} />,
						},
					]
				: []),
		],
	},
	{
		label: "Settings",
		icon: <Settings size={20} />,
		children: [
			{
				label: "Payment Methods",
				href: "/settings/payment-methods",
				icon: <CreditCard size={20} />,
			},
			{
				label: "Shipping Rates",
				href: "/settings/shipping-rates",
				icon: <Truck size={20} />,
			},
			{
				label: "Shipping Contribution Tiers",
				href: "/settings/shipping-contribution-tiers",
				icon: <Coins size={20} />,
			},
			{
				label: "Samples",
				href: "/settings/samples",
				icon: <Package size={20} />,
			},
			{
				label: "Shipping Providers",
				href: "/settings/shipping-providers",
				icon: <Plug size={20} />,
			},
			{
				label: "Public Holidays",
				href: "/settings/public-holidays",
				icon: <CalendarDays size={20} />,
			},
			{
				label: "AI Image Enhance",
				href: "/settings/ai",
				icon: <Sparkles size={20} />,
			},
			{
				label: "Slack",
				href: "/settings/slack",
				icon: <Slack size={20} />,
			},
		],
	},
];

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

	// Set once we've decided to leave (non-admin, password changed) so the
	// plain "not signed in" redirect below doesn't override the destination.
	const leavingRef = useRef(false);

	useEffect(() => {
		if (leavingRef.current) return;
		if (!isLoading && (!isAuthenticated || isError)) {
			router.replace("/login");
		}
	}, [isLoading, isAuthenticated, isError, router]);

	// A signed-in customer/vendor: end the session first, then go to /login.
	// Redirecting with the session intact made /login bounce straight back.
	useEffect(() => {
		if (isLoading || !isAuthenticated || !user || isAdminRole(user.role)) return;
		leavingRef.current = true;
		api.post("/auth/logout", {}).catch(() => {});
		clearAuthSession(queryClient);
		router.replace("/login?reason=no-admin");
	}, [isLoading, isAuthenticated, user, queryClient, router]);

	useEffect(() => {
		if (user?.must_change_password) setPwOpen(true);
	}, [user?.must_change_password]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: close mobile drawer on route change
	useEffect(() => {
		setMobileOpen(false);
	}, [pathname]);

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
			// The change revoked every session server-side; clear the cookies
			// too, or the stale access token keeps the shell signed in.
			leavingRef.current = true;
			await api.post("/auth/logout", {}).catch(() => {});
			clearAuthSession(queryClient);
			setPwOpen(false);
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

	// The shell never renders for an account that isn't platform staff.
	if (!isAuthenticated || !user || !isAdminRole(user.role)) {
		return null;
	}

	const breadcrumbs = getBreadcrumbs(pathname);
	const userName = `${user.first_name} ${user.last_name}`.trim() || user.email;
	const roleBadge = user.role === "super_admin" ? "Super Admin" : "Admin";

	return (
		<div className="flex h-screen overflow-hidden">
			<Sidebar
				items={navItems}
				currentPath={pathname}
				collapsed={collapsed}
				onToggle={() => setCollapsed((c) => !c)}
				appName="MaterialHub"
				roleBadge={roleBadge}
				mobileOpen={mobileOpen}
				onMobileClose={() => setMobileOpen(false)}
			/>
			<div className="flex flex-col flex-1 overflow-hidden">
				<DashboardHeader
					breadcrumbs={breadcrumbs}
					user={{ name: userName, avatar: user.avatar_url, role: roleBadge }}
					onLogout={() =>
						logout(undefined, { onSuccess: () => router.replace("/login") })
					}
					onChangePassword={() => setPwOpen(true)}
					onMenuClick={() => setMobileOpen(true)}
				/>
				<main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
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
