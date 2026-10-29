export default function ProductLoading() {
  return (
    <div className="bg-background min-h-screen animate-pulse">
      <div className="container py-4">
        <div className="flex gap-2 mb-4">
          <div className="h-3 w-16 rounded bg-muted" />
          <div className="h-3 w-3 rounded bg-muted" />
          <div className="h-3 w-20 rounded bg-muted" />
          <div className="h-3 w-3 rounded bg-muted" />
          <div className="h-3 w-32 rounded bg-muted" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10">
          <div className="space-y-3">
            <div className="aspect-square w-full rounded-2xl bg-muted" />
            <div className="flex gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-16 w-16 rounded-lg bg-muted" />
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="h-4 w-24 rounded bg-muted" />
            <div className="h-7 w-3/4 rounded bg-muted" />
            <div className="flex gap-3">
              <div className="h-4 w-24 rounded bg-muted" />
              <div className="h-4 w-20 rounded bg-muted" />
            </div>
            <div className="h-9 w-32 rounded bg-muted" />

            <div className="space-y-2 pt-2">
              <div className="h-4 w-16 rounded bg-muted" />
              <div className="flex gap-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-9 w-12 rounded-md bg-muted" />
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <div className="h-4 w-20 rounded bg-muted" />
              <div className="flex gap-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-9 w-9 rounded-full bg-muted" />
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-3">
              <div className="h-12 flex-1 rounded-lg bg-muted" />
              <div className="h-12 w-12 rounded-lg bg-muted" />
            </div>

            <div className="border rounded-xl p-4 space-y-2">
              <div className="h-4 w-32 rounded bg-muted" />
              <div className="h-3 w-1/2 rounded bg-muted" />
            </div>
          </div>
        </div>

        <div className="mt-10 space-y-4">
          <div className="flex gap-6 border-b pb-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-7 w-24 rounded bg-muted" />
            ))}
          </div>
          <div className="space-y-2">
            <div className="h-3 w-full rounded bg-muted" />
            <div className="h-3 w-11/12 rounded bg-muted" />
            <div className="h-3 w-3/4 rounded bg-muted" />
          </div>
        </div>

        <div className="mt-12 space-y-4">
          <div className="h-6 w-44 rounded bg-muted" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="aspect-square rounded-xl bg-muted" />
                <div className="h-4 w-3/4 rounded bg-muted" />
                <div className="h-3 w-1/2 rounded bg-muted" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
