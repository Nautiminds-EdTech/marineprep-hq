"use client";

import { useFormStatus } from "react-dom";

/** A form's submit button that shows `pending` text while the server action runs. */
export function SubmitButton({
  children,
  pending,
  className = "btn",
}: {
  children: React.ReactNode;
  pending: React.ReactNode;
  className?: string;
}) {
  const status = useFormStatus();
  return (
    <button type="submit" disabled={status.pending} className={className} aria-live="polite">
      {status.pending ? pending : children}
    </button>
  );
}
