"use client";

import { api } from "@/lib/api";
import { getMembershipsFromToken } from "@/lib/auth";
import { useMe } from "@/lib/queries/auth";
import { useAcceptInvite, useInvitePreview } from "@/lib/queries/vendor-members";
import { loginUrl } from "@/lib/return-to";
import { useActiveVendor } from "@/stores/active-vendor";
import { useAuthStore } from "@/stores/auth";
import {
	Button,
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@materialhub/ui";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

export default function InvitePage() {
	// Next 16: route params are async for server components; client pages read
	// them with useParams().
	const { token } = useParams<{ token: string }>();
	const router = useRouter();
	const queryClient = useQueryClient();
	const { data: preview, isLoading, isError } = useInvitePreview(token);
	const accept = useAcceptInvite();
	// useMe() fills the auth store from /auth/me (or clears it on 401).
	const me = useMe();
	const authedEmail = useAuthStore((s) => s.user?.email);

	if (isLoading) {
		return (
			<div className="grid min-h-screen place-items-center px-4">
				<p className="text-sm text-pearl/80">Loading invite…</p>
			</div>
		);
	}

	if (isError || !preview) {
		return (
			<div className="grid min-h-screen place-items-center px-4">
				<Card className="w-full max-w-sm">
					<CardHeader>
						<CardTitle>Invite not found</CardTitle>
						<CardDescription>This invite link is invalid or has been revoked.</CardDescription>
					</CardHeader>
				</Card>
			</div>
		);
	}

	const expired = preview.expired;
	// The preview returns the invite's status; only a pending invite can be
	// accepted or declined (a used/declined/revoked link offered both).
	const inviteStatus = (preview as { status?: string }).status;
	const closed = inviteStatus && inviteStatus !== "pending" && inviteStatus !== "invited";
	const emailMatch =
		Boolean(authedEmail) && authedEmail?.toLowerCase() === preview.invitedEmail.toLowerCase();

	return (
		<div className="grid min-h-screen place-items-center px-4">
			<Card className="w-full max-w-sm">
				<CardHeader>
					<CardTitle className="break-words">{preview.vendorName}</CardTitle>
					<CardDescription className="break-words">
						Invited as <strong className="capitalize">{preview.role}</strong> · Sent to{" "}
						{preview.invitedEmail}
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{closed ? (
						<p className="text-sm text-muted-foreground">
							{inviteStatus === "accepted" || inviteStatus === "active"
								? "This invite has already been accepted."
								: "This invite is no longer active. Ask the store owner for a new one."}
						</p>
					) : expired ? (
						<p className="text-sm text-destructive">
							This invite has expired. Ask the store owner to resend it.
						</p>
					) : me.isLoading ? (
						<p className="text-sm text-muted-foreground">Checking your sign-in…</p>
					) : !authedEmail ? (
						<Button asChild className="w-full">
							<Link href={loginUrl(`/invite/${token}`)}>Sign in as {preview.invitedEmail}</Link>
						</Button>
					) : !emailMatch ? (
						<p className="text-sm text-destructive">
							This invite is for {preview.invitedEmail}. You&apos;re signed in as {authedEmail}.
							Sign out, then open this link again.
						</p>
					) : (
						<Button
							className="w-full"
							disabled={accept.isPending}
							onClick={() => {
								const before = new Set(getMembershipsFromToken().map((m) => m.vid));
								accept.mutate(token, {
									onSuccess: async () => {
										// Refresh so the JWT carries the new membership (vm claim),
										// then make the newly joined store the active one.
										await api.post("/auth/refresh", {}).catch(() => {});
										const joined = getMembershipsFromToken().find((m) => !before.has(m.vid));
										if (joined) useActiveVendor.getState().setActiveVendorId(joined.vid);
										queryClient.clear();
										router.push("/");
									},
								});
							}}
						>
							{accept.isPending ? "Accepting…" : "Accept invite"}
						</Button>
					)}

					{accept.isError && (
						<p role="alert" className="text-xs text-destructive">
							{(accept.error as { response?: { data?: { message?: string } } })?.response?.data
								?.message ?? "Failed to accept invite"}
						</p>
					)}

					{!expired && (
						<p className="text-center text-xs text-muted-foreground">
							<Link href={`/invite/${token}/decline`} className="hover:underline">
								Decline this invite
							</Link>
						</p>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
