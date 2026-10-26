import Link from "next/link";

export function NotConnected({ service }: { service: string }) {
  return (
    <p className="card p-4 text-sm text-ink-2">
      {service} isn&apos;t connected yet. Add its keys to the server environment; see{" "}
      <Link href="/connections" className="text-accent underline-offset-2 hover:underline">
        Connections
      </Link>
      .
    </p>
  );
}
