"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeSlash, Warning } from "@phosphor-icons/react";
import * as React from "react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "../ui/dialog";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "../ui/form";
import { Input } from "../ui/input";

const schema = z
	.object({
		current_password: z.string().min(1, "Required"),
		new_password: z.string().min(8, "At least 8 characters"),
		confirm_password: z.string(),
	})
	.refine((v) => v.new_password === v.confirm_password, {
		path: ["confirm_password"],
		message: "Passwords do not match",
	});

type FormValues = z.infer<typeof schema>;

export interface ChangePasswordDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSubmit: (values: {
		current_password: string;
		new_password: string;
	}) => void | Promise<void>;
	isPending: boolean;
	/** Server error code from the failed attempt, e.g. INVALID_CURRENT_PASSWORD */
	errorCode?: string;
	/** Generic error message for the banner when errorCode is unknown */
	errorMessage?: string;
	/** When true: no Cancel button, no escape/outside-click dismissal, shows forced-change notice */
	forced?: boolean;
}

type PasswordInputProps = React.InputHTMLAttributes<HTMLInputElement>;

const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
	({ className, ...props }, ref) => {
		const [show, setShow] = useState(false);
		return (
			<div className="relative">
				<Input
					ref={ref}
					type={show ? "text" : "password"}
					{...props}
					className={cn("pr-10", className)}
				/>
				<button
					type="button"
					onClick={() => setShow((s) => !s)}
					className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
					aria-label={show ? "Hide password" : "Show password"}
					tabIndex={-1}
				>
					{show ? <EyeSlash size={18} /> : <Eye size={18} />}
				</button>
			</div>
		);
	},
);
PasswordInput.displayName = "PasswordInput";

export function ChangePasswordDialog({
	open,
	onOpenChange,
	onSubmit,
	isPending,
	errorCode,
	errorMessage,
	forced,
}: ChangePasswordDialogProps) {
	const form = useForm<FormValues>({
		resolver: zodResolver(schema),
		defaultValues: {
			current_password: "",
			new_password: "",
			confirm_password: "",
		},
	});

	// Subscribe to errors so FormMessage re-renders when setError is called externally
	const _errors = form.formState.errors;

	useEffect(() => {
		if (errorCode === "INVALID_CURRENT_PASSWORD") {
			form.setError("current_password", {
				type: "server",
				message: "Current password is incorrect",
			});
		}
	}, [errorCode, form]);

	const handleSubmit = form.handleSubmit(async (values) => {
		await onSubmit({
			current_password: values.current_password,
			new_password: values.new_password,
		});
	});

	const showGenericBanner =
		!!errorCode && errorCode !== "INVALID_CURRENT_PASSWORD";

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (forced && !next) return;
				onOpenChange(next);
			}}
		>
			<DialogContent
				onEscapeKeyDown={(e) => forced && e.preventDefault()}
				onPointerDownOutside={(e) => forced && e.preventDefault()}
				onInteractOutside={(e) => forced && e.preventDefault()}
				hideCloseButton={forced}
			>
				<DialogHeader>
					<DialogTitle>Change password</DialogTitle>
					<DialogDescription>
						Use at least 8 characters. You will be signed out of all sessions
						after a successful change.
					</DialogDescription>
				</DialogHeader>

				{forced && (
					<div className="rounded-sm border border-amber/30 bg-amber/10 px-3 py-2 text-sm text-cacao">
						Your administrator requires you to change your password before
						continuing.
					</div>
				)}

				{showGenericBanner && (
					<div
						role="alert"
						className="flex items-start gap-2 rounded-sm border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"
					>
						<Warning className="mt-0.5 h-4 w-4 flex-shrink-0" />
						<span>
							{errorMessage || "Could not change password. Please try again."}
						</span>
					</div>
				)}

				<Form {...form}>
					<form onSubmit={handleSubmit} className="space-y-4">
						<FormField
							control={form.control}
							name="current_password"
							render={({ field, fieldState }) => (
								<FormItem>
									<FormLabel htmlFor="current_password">
										Current password
									</FormLabel>
									<FormControl>
										<PasswordInput
											{...field}
											id="current_password"
											autoComplete="current-password"
											aria-invalid={!!fieldState.error}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="new_password"
							render={({ field, fieldState }) => (
								<FormItem>
									<FormLabel htmlFor="new_password">New password</FormLabel>
									<FormControl>
										<PasswordInput
											{...field}
											id="new_password"
											autoComplete="new-password"
											aria-invalid={!!fieldState.error}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="confirm_password"
							render={({ field, fieldState }) => (
								<FormItem>
									<FormLabel htmlFor="confirm_password">
										Confirm new password
									</FormLabel>
									<FormControl>
										<PasswordInput
											{...field}
											id="confirm_password"
											autoComplete="new-password"
											aria-invalid={!!fieldState.error}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<DialogFooter className={cn(forced && "sm:justify-end")}>
							{!forced && (
								<Button
									type="button"
									variant="outline"
									onClick={() => onOpenChange(false)}
									disabled={isPending}
								>
									Cancel
								</Button>
							)}
							<Button type="submit" disabled={isPending}>
								{isPending
									? "Changing…"
									: forced
										? "Set new password"
										: "Change password"}
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
