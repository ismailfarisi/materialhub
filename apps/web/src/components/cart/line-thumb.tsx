import { cn } from "@/lib/utils";
import { Package } from "lucide-react";
import Image from "next/image";

const PLACEHOLDER = "/placeholder.png";

/** Square product thumbnail in a board-grey well; an icon when there's no image. */
export function LineThumb({
	src,
	size,
	dimmed = false,
	className,
}: {
	src?: string | null;
	/** Rendered width in px, used for `sizes`. */
	size: number;
	dimmed?: boolean;
	className?: string;
}) {
	const hasImage = !!src && src !== PLACEHOLDER;
	return (
		<span
			className={cn(
				"relative block aspect-square shrink-0 overflow-hidden rounded-md bg-nl-linen ring-1 ring-inset ring-nl-cacao/10",
				className,
			)}
		>
			{hasImage ? (
				<Image
					src={src as string}
					alt=""
					fill
					sizes={`${size}px`}
					className={cn("object-cover", dimmed && "opacity-60 grayscale")}
				/>
			) : (
				<span className="absolute inset-0 grid place-items-center text-nl-russet/60">
					<Package className="h-1/3 w-1/3" strokeWidth={1.5} aria-hidden="true" />
				</span>
			)}
		</span>
	);
}
