import { cn } from "@/lib/utils";
import { Slot } from "@radix-ui/react-slot";
import { type VariantProps, cva } from "class-variance-authority";
import { type ButtonHTMLAttributes, forwardRef } from "react";

/**
 * Swatch Book button. Rectangular with a small radius, like a cut card.
 * - `primary`  binder ink: the default strong action
 * - `signal`   cutter orange: the single next step on a screen (add to cart, pay)
 * - `outline`  ink hairline on stock
 * - `ghost`    text-weight action
 */
export const buttonVariants = cva(
	"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-[background-color,color,border-color,box-shadow,transform] duration-150 ease-out active:translate-y-px disabled:pointer-events-none disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nl-amber",
	{
		variants: {
			variant: {
				primary: "bg-nl-cacao text-white hover:bg-nl-cacao/88",
				signal: "bg-nl-amber text-white hover:bg-[hsl(16_90%_45%)] shadow-[inset_0_-2px_0_rgb(0_0_0/0.12)]",
				outline: "border border-nl-cacao/25 bg-nl-pearl text-nl-cacao hover:border-nl-cacao/60",
				ghost: "text-nl-cacao hover:bg-nl-cacao/[0.06]",
				inverse: "bg-white text-nl-cacao hover:bg-white/90",
			},
			size: {
				sm: "h-9 px-3 text-[13px]",
				md: "h-11 px-4 text-sm",
				lg: "h-12 px-5 text-[15px]",
				icon: "h-10 w-10",
			},
		},
		defaultVariants: { variant: "primary", size: "md" },
	},
);

export interface ButtonProps
	extends ButtonHTMLAttributes<HTMLButtonElement>,
		VariantProps<typeof buttonVariants> {
	asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
	({ className, variant, size, asChild, ...props }, ref) => {
		const Comp = asChild ? Slot : "button";
		return (
			<Comp
				ref={ref}
				className={cn(buttonVariants({ variant, size }), className)}
				{...props}
			/>
		);
	},
);
Button.displayName = "Button";
