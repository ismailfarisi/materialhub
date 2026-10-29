"use client";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
} from "@materialhub/ui";
import { Sparkle } from "@phosphor-icons/react";
import {
  useOptInReelsProgram,
  useOptOutReelsProgram,
  useReelsProgram,
} from "@/lib/queries/reels-program";

const BASE_RATE_PERCENT = 5;

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function ReelsProgramCard() {
  const { data: status, isLoading, isError, error } = useReelsProgram();
  const optIn = useOptInReelsProgram();
  const optOut = useOptOutReelsProgram();

  const busy = optIn.isPending || optOut.isPending;
  const mutationError = optIn.error ?? optOut.error;

  if (isLoading) {
    return (
      <Card className="max-w-2xl">
        <CardHeader>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-10 w-32 mt-2" />
        </CardContent>
      </Card>
    );
  }

  if (isError || !status) {
    return (
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Reels program</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">
            {error instanceof Error
              ? error.message
              : "Failed to load reels program status."}
          </p>
        </CardContent>
      </Card>
    );
  }

  const ratePercent = Number(status.commissionRate) * 100;
  const subsidyActive =
    !!status.subsidyEndsAt && new Date(status.subsidyEndsAt) > new Date();
  const subsidiedRate = ratePercent / 2;

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkle size={18} className="text-primary" />
              Reels program
            </CardTitle>
            <CardDescription className="mt-1">
              Let creators earn a commission for driving sales to your products
              via reels.
            </CardDescription>
          </div>
          {status.isActive ? (
            <Badge variant="default">Enrolled</Badge>
          ) : (
            <Badge variant="secondary">Not enrolled</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {status.isActive ? (
          <>
            <p className="text-sm">
              Creators tagging your products earn a{" "}
              <strong>{ratePercent.toFixed(1)}%</strong> commission on sales
              attributed to their videos.
            </p>
            {subsidyActive && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                MaterialHub is paying half the commission until{" "}
                <strong>{formatDate(status.subsidyEndsAt)}</strong>. Your real
                cost during this window is{" "}
                <strong>{subsidiedRate.toFixed(1)}%</strong>.
              </div>
            )}
            {!subsidyActive && status.subsidyEndsAt && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                Your 6-month subsidy window ended{" "}
                <strong>{formatDate(status.subsidyEndsAt)}</strong>. You now pay
                the full {ratePercent.toFixed(1)}% commission on
                reels-attributed sales.
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Joined {formatDate(status.joinedAt)}
            </p>
            <div>
              <Button
                variant="destructive"
                disabled={busy}
                onClick={() => optOut.mutate()}
              >
                {optOut.isPending ? "Opting out…" : "Opt out"}
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                Pending commissions from attributions already recorded will
                still be paid out.
              </p>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm">
              Join the reels program. Creators tagging your products will earn
              a <strong>{BASE_RATE_PERCENT}%</strong> commission on sales
              attributed to their videos.
            </p>
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
              MaterialHub pays half the commission for the first 6 months — your
              real cost during that window is just{" "}
              <strong>{(BASE_RATE_PERCENT / 2).toFixed(1)}%</strong>.
            </div>
            <Button disabled={busy} onClick={() => optIn.mutate()}>
              {optIn.isPending ? "Opting in…" : "Opt in"}
            </Button>
          </>
        )}

        {mutationError && (
          <p className="text-sm text-destructive">
            {mutationError instanceof Error
              ? mutationError.message
              : "Something went wrong. Please try again."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
