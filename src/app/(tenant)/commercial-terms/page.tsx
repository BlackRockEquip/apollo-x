import { redirect } from "next/navigation";

// 2026-10-01 — Commercial Terms moved into the combined Configuration page
// (see configuration/page.tsx and settings-nav.ts's "configuration" item),
// per user request: "Move Tax codes, Commercial Terms, Numbering all under
// one menu button separate tabs." Kept as a redirect, not deleted, so any
// existing bookmark/link to /commercial-terms still lands somewhere useful.
export default function Page() {
  redirect("/configuration");
}
