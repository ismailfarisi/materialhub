export default function ReelsLoading() {
  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center">
      <div className="relative aspect-[9/16] h-full max-h-screen w-auto bg-zinc-900 animate-pulse">
        <div className="absolute right-3 bottom-24 flex flex-col gap-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <div className="h-11 w-11 rounded-full bg-white/10" />
              <div className="h-3 w-8 rounded bg-white/10" />
            </div>
          ))}
        </div>

        <div className="absolute left-4 right-20 bottom-8 space-y-2">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-full bg-white/10" />
            <div className="h-4 w-32 rounded bg-white/10" />
          </div>
          <div className="h-3 w-3/4 rounded bg-white/10" />
          <div className="h-3 w-1/2 rounded bg-white/10" />
        </div>
      </div>
    </div>
  );
}
