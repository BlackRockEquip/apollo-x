import { redirect } from "next/navigation";

// 2026-10-05 — RFQs moved out of the Suppliers tabs to the new Parts sidebar
// item (/parts, RFQs tab). Kept so old bookmarks and links still land there.
export default function Page() {
  redirect("/parts");
}
