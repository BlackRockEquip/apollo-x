import { redirect } from "next/navigation";

// 2026-10-06 — Parts Outstanding is now the default Parts tab at /parts (tabs
// swapped, RFQs moved to /parts/rfq). Kept so old bookmarks still land there.
export default function Page() {
  redirect("/parts");
}
