import Link from "next/link";
import { Notice } from "./notice";

export function NotConnected({ service }: { service: string }) {
  return (
    <Notice tone="warning">
      {service} isn&apos;t connected yet. Add its keys to the server environment; see{" "}
      <Link href="/connections" className="font-medium text-accent underline-offset-2 hover:underline">
        Connections
      </Link>
      .
    </Notice>
  );
}
