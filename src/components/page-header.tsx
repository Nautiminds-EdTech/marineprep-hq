/** Page title row: title and one-line context on the left, actions on the right (stacked on phones). */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[1.75rem] leading-tight font-semibold tracking-tight md:text-3xl">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** A titled group of content. The card is optional so lists of cards don't nest. */
export function Section({
  title,
  description,
  action,
  card = true,
  className = "",
  children,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  card?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const head = (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
      <div className="min-w-0">
        <h2 className="text-base font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-ink-3">{description}</p>}
      </div>
      {action}
    </div>
  );
  return (
    <section className={`flex min-w-0 flex-col gap-4 ${card ? "card p-4 sm:p-5" : ""} ${className}`}>
      {head}
      {children}
    </section>
  );
}
