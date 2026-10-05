import { redirect } from "next/navigation";

// 2026-10-05 — Outwork moved out of the Suppliers tabs to its own sidebar item
// under Jobs (/outwork). Kept so old bookmarks and links still land there.
export default function Page() {
  redirect("/outwork");
}
