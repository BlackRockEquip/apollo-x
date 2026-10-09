"use client";

import { TablePrintButton } from "@/components/TablePrintButton";

// Jobs & WIP list — "Print" button (2026-10-06, user request: "Create a Print
// view of the table however the user filtered or saved the columns").
// 2026-10-09: the print logic moved into the shared TablePrintButton so every
// table under Jobs can use it; this stays as the Jobs & WIP flavour of it.
export function JobsWipPrintButton({ tableId, filterSummary }: { tableId: string; filterSummary: string }) {
  return <TablePrintButton tableId={tableId} title="Jobs & WIP" noun="job" filterSummary={filterSummary === "No filters (all jobs)" ? "" : filterSummary} />;
}
