export default function HomeLoading() {
  return (
    <div className="animate-pulse">
      <div className="border-b">
        <div className="flex gap-2 overflow-hidden px-4 md:max-w-[1400px] md:mx-auto md:px-8 py-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-7 w-20 shrink-0 rounded-full bg-muted" />
          ))}
        </div>
      </div>

      <div className="pb-8 md:pb-12 space-y-12 md:space-y-16">
        <div className="px-4 md:max-w-[1400px] md:mx-auto md:px-8 pt-4">
          <div className="aspect-[16/7] w-full rounded-2xl bg-muted" />
        </div>

        {Array.from({ length: 2 }).map((_, s) => (
          <div key={s} className="px-4 md:max-w-[1400px] md:mx-auto md:px-8 space-y-4">
            <div className="h-7 w-56 rounded bg-muted" />
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

        <div className="px-4 md:max-w-[1400px] md:mx-auto md:px-8 space-y-4">
          <div className="h-6 w-40 rounded bg-muted" />
          <div className="flex gap-3 overflow-hidden">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="aspect-square w-32 shrink-0 rounded-xl bg-muted" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
