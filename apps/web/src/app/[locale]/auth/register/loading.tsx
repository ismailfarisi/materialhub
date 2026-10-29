export default function RegisterLoading() {
  return (
    <div className="container max-w-md py-20 animate-pulse">
      <div className="h-8 w-44 rounded bg-muted mx-auto mb-6" />
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="h-4 w-20 rounded bg-muted mb-2" />
            <div className="h-10 w-full rounded-lg bg-muted" />
          </div>
          <div>
            <div className="h-4 w-20 rounded bg-muted mb-2" />
            <div className="h-10 w-full rounded-lg bg-muted" />
          </div>
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i}>
            <div className="h-4 w-24 rounded bg-muted mb-2" />
            <div className="h-10 w-full rounded-lg bg-muted" />
          </div>
        ))}
        <div className="h-12 w-full rounded-lg bg-muted" />
        <div className="h-4 w-3/4 rounded bg-muted mx-auto" />
      </div>
    </div>
  );
}
