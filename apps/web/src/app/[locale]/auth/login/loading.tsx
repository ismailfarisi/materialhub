export default function LoginLoading() {
  return (
    <div className="container max-w-md py-20 animate-pulse">
      <div className="h-8 w-40 rounded bg-muted mx-auto mb-6" />
      <div className="space-y-4">
        <div>
          <div className="h-4 w-16 rounded bg-muted mb-2" />
          <div className="h-10 w-full rounded-lg bg-muted" />
        </div>
        <div>
          <div className="h-4 w-20 rounded bg-muted mb-2" />
          <div className="h-10 w-full rounded-lg bg-muted" />
        </div>
        <div className="h-12 w-full rounded-lg bg-muted" />
        <div className="h-4 w-3/4 rounded bg-muted mx-auto" />
      </div>
    </div>
  );
}
