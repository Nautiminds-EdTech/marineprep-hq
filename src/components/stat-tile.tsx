export function StatTile({
  label,
  value,
  sub,
  note,
}: {
  label: string;
  value: string;
  sub?: string;
  /** Shown instead of a value when the data isn't available yet. */
  note?: string;
}) {
  return (
    <div className="card p-4">
      <p className="text-sm text-ink-2">{label}</p>
      {note ? (
        <p className="mt-2 text-sm text-ink-3">{note}</p>
      ) : (
        <>
          <p className="mt-1 text-3xl font-semibold tabular-nums text-ink">{value}</p>
          {sub && <p className="mt-1 text-xs text-ink-3">{sub}</p>}
        </>
      )}
    </div>
  );
}
