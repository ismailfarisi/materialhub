import * as Phosphor from "@phosphor-icons/react";
import type { IconWeight } from "@phosphor-icons/react";
import * as LucideIcons from "@phosphor-icons/react";

// Icon mapping: Lucide names → Phosphor icons
const iconMap: Record<string, keyof typeof Phosphor> = {
	SquaresFour: "SquaresFour",
	Package: "Package",
	ShoppingCart: "ShoppingCart",
	Gear: "Gear",
	Wallet: "Wallet",
	ChartBar: "ChartBar",
	Gavel: "Gavel",
	ArrowCounterClockwise: "ArrowCounterClockwise",
	Tag: "Tag",
	Lightning: "Lightning",
	Sparkle: "Sparkle",
	Truck: "Truck",
	UploadSimple: "UploadSimple",
	FileText: "FileText",
	Plus: "Plus",
	CaretDown: "CaretDown",
	CaretRight: "CaretRight",
	CaretLeft: "CaretLeft",
	MagnifyingGlass: "MagnifyingGlass",
	X: "X",
	Check: "Check",
	WarningCircle: "WarningCircle",
	Warning: "Warning",
	Archive: "Archive",
	ArrowLeft: "ArrowLeft",
	ArrowRight: "ArrowRight",
	CheckCircle: "CheckCircle",
	CheckCircle2: "CheckCircle",
	CreditCard: "CreditCard",
	CurrencyDollar: "CurrencyDollar",
	DotsSixVertical: "DotsSixVertical",
	ImageIcon: "Image",
	Spinner: "Spinner",
	Lock: "Lock",
	MessageSquare: "ChatText",
	Percent: "Percent",
	Plug: "Plug",
	Save: "FloppyDisk",
	Send: "PaperPlaneRight",
	ShieldCheck: "ShieldCheck",
	Sliders: "Sliders",
		StickyNote: "Note",
	Video: "VideoCamera",
	XCircle: "XCircle",
	Info: "Info",
	DotsThree: "DotsThree",
	DotsThreeVertical: "DotsThreeVertical",
	ArrowSquareOut: "ArrowSquareOut",
	Copy: "Copy",
	Trash: "Trash",
	Pencil: "Pencil",
	Eye: "Eye",
	EyeSlash: "EyeSlash",
	DownloadSimple: "DownloadSimple",
	ArrowClockwise: "ArrowClockwise",
	Funnel: "Funnel",
	SignOut: "SignOut",
	User: "User",
	Users: "Users",
	Bell: "Bell",
	Question: "Question",
	Calendar: "Calendar",
	Clock: "Clock",
	House: "House",
	List: "List",
	Star: "Star",
	Heart: "Heart",
	Share: "Share",
	Link: "Link",
	Phone: "Phone",
	Envelope: "Envelope",
	MapPin: "MapPin",
	Building: "Buildings",
	Store: "Storefront",
	Cube: "Cube",
	Briefcase: "Briefcase",
};

/**
 * Legacy support: accept Lucide icon names, return Phosphor icons
 *
 * Maps Lucide icon names to their Phosphor equivalents. If a mapping exists
 * in iconMap, returns the corresponding Phosphor icon. Falls back to Lucide
 * if no Phosphor equivalent is found. Returns null component if icon doesn't
 * exist in either library.
 *
 * @param lucideName - The Lucide icon name to map
 * @returns React component for the icon (Phosphor, Lucide fallback, or null)
 *
 * @example
 * const Icon = getIcon('ShoppingCart');
 * <Icon size={24} />
 */
export function getIcon(lucideName: string): React.ComponentType<{
	size?: number;
	className?: string;
	weight?: IconWeight;
}> {
	const phosphorName = iconMap[lucideName] || lucideName;
	const PhosphorIcon = (Phosphor as any)[phosphorName];

	if (!PhosphorIcon) {
		// Fallback to Lucide if mapping not found
		const LucideIcon = (LucideIcons as any)[lucideName];
		if (LucideIcon) {
			if (process.env.NODE_ENV === "development") {
				console.warn(
					`[IconAdapter] No Phosphor mapping found for "${lucideName}". Falling back to Lucide icon. Add to iconMap to fix.`,
				);
			}
			return LucideIcon as React.ComponentType<{
				size?: number;
				className?: string;
				weight?: IconWeight;
			}>;
		}
		// Ultimate fallback
		if (process.env.NODE_ENV === "development") {
			console.warn(
				`[IconAdapter] No icon found for "${lucideName}" in Phosphor or Lucide libraries. Returning null.`,
			);
		}
		return () => null;
	}

	return PhosphorIcon;
}

/**
 * Convenience component for rendering icons by name
 *
 * Renders icons using Phosphor icons library with Lucide name support.
 * Automatically maps Lucide icon names to Phosphor equivalents.
 *
 * @param name - The Lucide icon name to render
 * @param size - Icon size in pixels (default: 20)
 * @param weight - Phosphor icon weight (default: 'thin')
 * @param className - Optional CSS class name
 *
 * @example
 * <Icon name="ShoppingCart" size={24} weight="regular" />
 */
export function Icon({
	name,
	size = 20,
	weight = "thin",
	className,
}: { name: string; size?: number; weight?: IconWeight; className?: string }) {
	const IconComponent = getIcon(name);
	return <IconComponent size={size} weight={weight} className={className} />;
}
