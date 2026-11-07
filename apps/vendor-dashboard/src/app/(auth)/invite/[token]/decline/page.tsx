"use client";

import { useDeclineInvite, useInvitePreview } from "@/lib/queries/vendor-members";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@materialhub/ui";
import { useParams } from "next/navigation";

export default function DeclinePage() {
	const { token } = useParams<{ token: string }>();
	const { data: preview } = useInvitePreview(token);
	const decline = useDeclineInvite();
	const done = decline.isSuccess;

	return (
		<div className="grid min-h-screen place-items-center px-4">
			<Card className="w-full max-w-sm">
				<CardHeader>
					<CardTitle>
						{done ? "Invite declined" : decline.isError ? "Could not decline" : "Decline invite"}
					</CardTitle>
					{!done && preview ? (
						<CardDescription className="break-words">
							{preview.vendorName} invited {preview.invitedEmail} as{" "}
							<span className="capitalize">{preview.role}</span>.
						</CardDescription>
					) : null}
				</CardHeader>
				<CardContent className="space-y-3">
					{done ? (
						<p className="text-sm text-muted-foreground">
							The invite has been declined. You can close this tab.
						</p>
					) : (
						// An explicit click, not on page load: link previews and
						// prefetchers must not decline an invite by visiting it.
						<Button
							variant="outline"
							className="w-full"
							disabled={decline.isPending}
							onClick={() => decline.mutate(token)}
						>
							{decline.isPending ? "Declining…" : "Decline invite"}
						</Button>
					)}
					{decline.isError && (
						<p role="alert" className="text-sm text-destructive">
							{(decline.error as { response?: { data?: { message?: string } } })?.response?.data
								?.message ?? "The invite could not be declined. The link may already be invalid."}
						</p>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
