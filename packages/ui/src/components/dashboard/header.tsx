"use client";

import { CaretRight, Key, List, SignOut } from "@phosphor-icons/react";
import Link from "next/link";
import { cn } from "../../lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "../ui/dropdown-menu";

interface Breadcrumb {
	label: string;
	href?: string;
}

interface DashboardHeaderProps {
	breadcrumbs: Breadcrumb[];
	user: { name: string; avatar?: string; role: string };
	onLogout: () => void;
	/** When provided, a "Change password" item is rendered in the avatar dropdown. */
	onChangePassword?: () => void;
	/** When provided, a hamburger button (lg:hidden) is rendered to open the mobile nav drawer. */
	onMenuClick?: () => void;
}

function getInitials(name: string): string {
	return name
		.split(" ")
		.map((part) => part.charAt(0))
		.slice(0, 2)
		.join("")
		.toUpperCase();
}

export function DashboardHeader({
	breadcrumbs,
	user,
	onLogout,
	onChangePassword,
	onMenuClick,
}: DashboardHeaderProps) {
	return (
		<header className="flex items-center justify-between h-16 px-4 lg:px-6 bg-linen border-b border-pearl/14">
			{/* Left: hamburger (mobile) + breadcrumbs */}
			<div className="flex items-center gap-3 min-w-0">
				{onMenuClick && (
					<button
						type="button"
						onClick={onMenuClick}
						aria-label="Open menu"
						className="lg:hidden -ml-1 p-1.5 rounded-sm text-cacao hover:bg-pearl/30 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
					>
						<List className="w-6 h-6" />
					</button>
				)}
				<nav
					aria-label="Breadcrumb"
					className="flex items-center gap-2 text-sm min-w-0 overflow-x-auto"
				>
					{breadcrumbs.map((crumb, index) => {
						const isLast = index === breadcrumbs.length - 1;
						return (
							<span key={index} className="flex items-center gap-1">
								{index > 0 && (
									<CaretRight className="w-4 h-4 text-amber/60 flex-shrink-0" />
								)}
								{isLast ? (
									<span className="font-semibold text-cacao whitespace-nowrap">
										{crumb.label}
									</span>
								) : crumb.href ? (
									<Link
										href={crumb.href}
										className="text-amber hover:underline whitespace-nowrap"
									>
										{crumb.label}
									</Link>
								) : (
									<span className="text-muted-foreground whitespace-nowrap">
										{crumb.label}
									</span>
								)}
							</span>
						);
					})}
				</nav>
			</div>

			{/* User dropdown */}
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						className={cn(
							"flex items-center gap-2 px-3 py-2 rounded-sm hover:bg-pearl/30 border border-pearl/28 text-cacao",
							"transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
						)}
					>
						<Avatar className="w-8 h-8">
							{user.avatar && <AvatarImage src={user.avatar} alt={user.name} />}
							<AvatarFallback className="text-xs">
								{getInitials(user.name)}
							</AvatarFallback>
						</Avatar>
						<div className="hidden sm:flex flex-col items-start">
							<span className="text-sm font-medium text-cacao leading-tight">
								{user.name}
							</span>
							<span className="text-xs text-muted-foreground leading-tight">
								{user.role}
							</span>
						</div>
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-48">
					<DropdownMenuLabel className="font-normal">
						<div className="flex flex-col">
							<span className="font-semibold text-sm">{user.name}</span>
							<span className="text-xs text-muted-foreground">{user.role}</span>
						</div>
					</DropdownMenuLabel>
					<DropdownMenuSeparator />
					{onChangePassword && (
						<>
							<DropdownMenuItem
								onClick={onChangePassword}
								className="cursor-pointer"
							>
								<Key className="w-4 h-4 mr-2" />
								Change password
							</DropdownMenuItem>
							<DropdownMenuSeparator />
						</>
					)}
					<DropdownMenuItem
						onClick={onLogout}
						className="text-red-600 focus:text-red-600 cursor-pointer"
					>
						<SignOut className="w-4 h-4 mr-2" />
						Logout
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</header>
	);
}
