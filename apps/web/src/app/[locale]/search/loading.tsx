export default function SearchLoading() {
  return (
    <div className="container py-4 animate-pulse">
      <div className="h-7 w-72 rounded bg-muted mb-4" />

      <div className="flex flex-col lg:flex-row gap-6 mt-2">
        <div className="hidden lg:block w-60 shrink-0 space-y-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-5 w-32 rounded bg-muted" />
              <div className="space-y-1.5">
                {Array.from({ length: 5 }).map((_, j) => (
                  <div key={j} className="h-4 w-full rounded bg-muted" />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex-1">
          <div className="flex justify-between items-center mb-4">
            <div className="h-5 w-32 rounded bg-muted" />
            <div className="h-9 w-40 rounded bg-muted" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="aspect-square rounded-xl bg-muted" />
                <div className="h-4 w-3/4 rounded bg-muted" />
                <div className="h-3 w-1/2 rounded bg-muted" />
                <div className="h-4 w-1/3 rounded bg-muted" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
