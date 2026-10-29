export default function VendorLoading() {
  return (
    <div className="animate-pulse">
      <div className="relative h-48 md:h-64 w-full bg-muted" />

      <div className="px-4 md:max-w-[1400px] md:mx-auto md:px-8 -mt-12 relative">
        <div className="flex items-end gap-4">
          <div className="h-24 w-24 md:h-28 md:w-28 rounded-2xl bg-muted border-4 border-background" />
          <div className="flex-1 pb-2 space-y-2">
            <div className="h-6 w-1/3 rounded bg-muted" />
            <div className="h-4 w-1/2 rounded bg-muted" />
          </div>
        </div>
      </div>

      <div className="pb-12 mt-8 space-y-12 md:space-y-16">
        {Array.from({ length: 2 }).map((_, s) => (
          <div key={s} className="px-4 md:max-w-[1400px] md:mx-auto md:px-8 space-y-4">
            <div className="h-6 w-48 rounded bg-muted" />
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
        ))}
      </div>
    </div>
  );
}
