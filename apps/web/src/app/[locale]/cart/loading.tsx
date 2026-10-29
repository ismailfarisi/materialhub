export default function CartLoading() {
  return (
    <div className="container py-6 animate-pulse">
      <div className="h-8 w-32 rounded bg-muted mb-6" />
      <div className="flex flex-col lg:flex-row gap-8">
        <div className="flex-1 space-y-6">
          {Array.from({ length: 2 }).map((_, g) => (
            <div key={g} className="space-y-3">
              <div className="h-4 w-40 rounded bg-muted" />
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="flex gap-4 border rounded-lg p-3">
                  <div className="h-20 w-20 rounded-lg bg-muted shrink-0" />
                  <div className="flex-1 space-y-2 py-1">
                    <div className="h-4 w-3/4 rounded bg-muted" />
                    <div className="h-3 w-1/3 rounded bg-muted" />
                    <div className="h-5 w-20 rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="lg:w-80">
          <div className="border rounded-lg p-4 space-y-3">
            <div className="h-5 w-24 rounded bg-muted" />
            <div className="flex justify-between">
              <div className="h-4 w-20 rounded bg-muted" />
              <div className="h-4 w-16 rounded bg-muted" />
            </div>
            <div className="flex justify-between">
              <div className="h-4 w-12 rounded bg-muted" />
              <div className="h-4 w-12 rounded bg-muted" />
            </div>
            <div className="flex justify-between border-t pt-3">
              <div className="h-5 w-16 rounded bg-muted" />
              <div className="h-5 w-20 rounded bg-muted" />
            </div>
            <div className="h-11 w-full rounded-lg bg-muted" />
          </div>
        </div>
      </div>
    </div>
  );
}
