"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@materialhub/ui";
import { api } from "@/lib/api";
import {
  useAcceptInvite,
  useInvitePreview,
} from "@/lib/queries/vendor-members";
import { useAuthStore } from "@/stores/auth";

interface InvitePageProps {
  params: { token: string };
}

export default function InvitePage({ params }: InvitePageProps) {
  const router = useRouter();
  const { data: preview, isLoading, isError } = useInvitePreview(params.token);
  const accept = useAcceptInvite();
  const user = useAuthStore((s) => s.user);
  const [authChecked, setAuthChecked] = useState(false);

  // If the auth store is empty on mount, hit /auth/me to check.
  useEffect(() => {
    if (user) {
      setAuthChecked(true);
      return;
    }
    api
      .get("/auth/me")
      .then(() => setAuthChecked(true))
      .catch(() => setAuthChecked(true));
  }, [user]);

  if (isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-zinc-50">
        <div className="text-sm text-zinc-500">Loading…</div>
      </div>
    );
  }

  if (isError || !preview) {
    return (
      <div className="grid min-h-screen place-items-center bg-zinc-50">
        <Card className="w-96">
          <CardHeader>
            <CardTitle>Invite not found</CardTitle>
            <CardDescription>
              This invite link is invalid or has been revoked.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const expired = preview.expired;
  const authedEmail = useAuthStore.getState().user?.email;
  const emailMatch =
    Boolean(authedEmail) &&
    authedEmail!.toLowerCase() === preview.invitedEmail.toLowerCase();

  return (
    <div className="grid min-h-screen place-items-center bg-zinc-50">
      <Card className="w-96">
        <CardHeader>
          <CardTitle>{preview.vendorName}</CardTitle>
          <CardDescription>
            Invited as <strong className="capitalize">{preview.role}</strong> · Sent to{" "}
            {preview.invitedEmail}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {expired ? (
            <p className="text-sm text-red-600">This invite has expired.</p>
          ) : !authChecked ? (
            <p className="text-sm text-zinc-500">Checking auth…</p>
          ) : !authedEmail ? (
            <Button asChild className="w-full">
              <a href={`/login?next=/invite/${params.token}`}>
                Sign in as {preview.invitedEmail}
              </a>
            </Button>
          ) : !emailMatch ? (
            <p className="text-sm text-orange-600">
              This invite is for {preview.invitedEmail}. You&apos;re signed in as{" "}
              {authedEmail}. Log out to continue.
            </p>
          ) : (
            <Button
              className="w-full"
              disabled={accept.isPending}
              onClick={() =>
                accept.mutate(params.token, {
                  onSuccess: async () => {
                    // Trigger /auth/refresh so the JWT picks up the new vm claim.
                    await api.post("/auth/refresh").catch(() => {});
                    router.push("/team");
                  },
                })
              }
            >
              {accept.isPending ? "Accepting…" : "Accept invite"}
            </Button>
          )}

          {accept.isError && (
            <div className="text-xs text-red-600">
              {(accept.error as { response?: { data?: { message?: string } } })?.response
                ?.data?.message ?? "Failed to accept invite"}
            </div>
          )}

          <p className="text-center text-xs text-zinc-400">
            <a
              href={`/invite/${params.token}/decline`}
              className="hover:underline"
            >
              Decline this invite
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
