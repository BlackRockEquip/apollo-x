import { redirect } from "next/navigation";

// 2026-10-05 — RFQs moved out of the Suppliers tabs to the Parts sidebar item;
// 2026-10-06 the Parts tabs were swapped, so RFQs now lives at /parts/rfq.
// Kept so old bookmarks and links still land there.
export default function Page() {
  redirect("/parts/rfq");
}
