export default function CheckoutLoading() {
  return (
    <div className="container py-6 animate-pulse">
      <div className="h-8 w-40 rounded bg-muted mb-6" />
      <div className="flex flex-col lg:flex-row gap-8">
        <div className="flex-1 space-y-5">
          <div className="border rounded-xl p-5 space-y-3">
            <div className="h-5 w-44 rounded bg-muted" />
            <div className="h-10 w-full rounded bg-muted" />
            <div className="grid grid-cols-2 gap-3">
              <div className="h-10 rounded bg-muted" />
              <div className="h-10 rounded bg-muted" />
            </div>
          </div>
          <div className="border rounded-xl p-5 space-y-3">
            <div className="h-5 w-32 rounded bg-muted" />
            <div className="h-12 w-full rounded bg-muted" />
            <div className="h-12 w-full rounded bg-muted" />
          </div>
          <div className="border rounded-xl p-5 space-y-3">
            <div className="h-5 w-28 rounded bg-muted" />
            <div className="h-12 w-full rounded bg-muted" />
            <div className="h-32 w-full rounded bg-muted" />
          </div>
        </div>

        <div className="lg:w-80">
          <div className="border rounded-xl p-5 space-y-4">
            <div className="h-4 w-24 rounded bg-muted" />
            <div className="space-y-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <div className="h-14 w-14 rounded bg-muted shrink-0" />
                  <div className="flex-1 space-y-1.5 py-1">
                    <div className="h-3 w-3/4 rounded bg-muted" />
                    <div className="h-3 w-1/3 rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t pt-3 space-y-2">
              <div className="flex justify-between">
                <div className="h-4 w-16 rounded bg-muted" />
                <div className="h-4 w-12 rounded bg-muted" />
              </div>
              <div className="flex justify-between">
                <div className="h-4 w-16 rounded bg-muted" />
                <div className="h-4 w-12 rounded bg-muted" />
              </div>
              <div className="flex justify-between">
                <div className="h-5 w-12 rounded bg-muted" />
                <div className="h-5 w-20 rounded bg-muted" />
              </div>
            </div>
            <div className="h-12 w-full rounded-lg bg-muted" />
          </div>
        </div>
      </div>
    </div>
  );
}
