import { redirect } from "next/navigation";

// 2026-09-10 — Parts Catalog was merged into Stock Levels (a single page
// now covers catalog fields + stock columns + bin location + create/edit/
// delete — see StockLevelsWorkspace.tsx). This route is kept only so any
// old bookmark/link to /parts still lands somewhere useful instead of
// 404ing.
export default function Page() {
  redirect("/inventory");
}
