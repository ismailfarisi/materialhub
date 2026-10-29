export default function Loading() {
  return (
    <div className="mx-auto max-w-[1400px] py-4 px-4">
      <div className="h-8 w-40 bg-nl-russet/15 mb-6" />
      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-8">
        <div className="h-64 bg-nl-russet/10" />
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="aspect-[4/5] bg-nl-russet/10" />
          ))}
        </div>
      </div>
    </div>
  );
}
