"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@materialhub/ui";
import { useDeclineInvite } from "@/lib/queries/vendor-members";

interface DeclinePageProps {
  params: { token: string };
}

export default function DeclinePage({ params }: DeclinePageProps) {
  const decline = useDeclineInvite();
  const [done, setDone] = useState(false);

  useEffect(() => {
    decline.mutate(params.token, { onSuccess: () => setDone(true) });
    // Intentionally only run once on mount.
    // biome-ignore lint/correctness/useExhaustiveDependencies: mutation callback closes over local state correctly
  }, []);

  return (
    <div className="grid min-h-screen place-items-center bg-zinc-50">
      <Card className="w-96">
        <CardHeader>
          <CardTitle>
            {done
              ? "Invite declined"
              : decline.isError
                ? "Could not decline"
                : "Declining…"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {done && (
            <p className="text-sm text-zinc-600">
              The invite has been declined. You can close this tab.
            </p>
          )}
          {decline.isError && (
            <p className="text-sm text-red-600">
              {(decline.error as { response?: { data?: { message?: string } } })
                ?.response?.data?.message ??
                "The invite could not be declined. The link may already be invalid."}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
