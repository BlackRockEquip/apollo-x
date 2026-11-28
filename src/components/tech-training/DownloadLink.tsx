import type { ReactNode } from "react";

// A plain link to a file download from our own API (CSV exports). Not a page, so next/link does not apply.
export function DownloadLink({ href, children, className = "quiet-button" }: { href: string; children: ReactNode; className?: string }) {
  return <a className={className} href={href} download>{children}</a>;
}
