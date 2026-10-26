/** Loading placeholders shaped like the content, so the page doesn't jump when data arrives. */
export function TilesSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton h-32" />
      ))}
    </div>
  );
}

export function PageSkeleton({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label={label}>
      <TilesSkeleton />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="skeleton h-72 lg:col-span-2" />
        <div className="skeleton h-72" />
      </div>
      <div className="skeleton h-48" />
      <span className="sr-only">{label}</span>
    </div>
  );
}
