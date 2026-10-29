export default function AccountLoading() {
  const pulse = { background: "rgba(44,24,16,0.07)" } as const;
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-6 w-40" style={pulse} />
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="p-4 flex gap-3"
            style={{ border: "1px solid rgba(44,24,16,0.10)" }}
          >
            <div className="h-12 w-12 shrink-0" style={pulse} />
            <div className="flex-1 space-y-2 py-1">
              <div className="h-4 w-1/2" style={pulse} />
              <div className="h-3 w-1/3" style={pulse} />
            </div>
            <div className="h-4 w-16 self-center" style={pulse} />
          </div>
        ))}
      </div>
    </div>
  );
}
