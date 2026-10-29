export default function ServiceLoading() {
  return (
    <div className="bg-background min-h-screen animate-pulse">
      <div className="container py-6 md:py-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
          <div className="space-y-2">
            <div className="aspect-square w-full rounded-2xl bg-muted" />
            <div className="flex gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-16 w-16 rounded-lg bg-muted" />
              ))}
            </div>
          </div>
          <div className="space-y-4">
            <div className="h-3 w-24 rounded bg-muted" />
            <div className="h-8 w-3/4 rounded bg-muted" />
            <div className="h-5 w-40 rounded bg-muted" />
            <div className="h-16 w-full rounded bg-muted" />
            <div className="space-y-2 pt-4">
              <div className="h-9 w-full rounded bg-muted" />
              <div className="h-16 w-full rounded bg-muted" />
              <div className="h-24 w-full rounded bg-muted" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
