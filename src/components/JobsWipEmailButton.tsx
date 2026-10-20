"use client";

import { TableEmailButton } from "@/components/TableEmailButton";

// Jobs & WIP list - "Email" button next to Print (2026-10-20, user request). Same filter summary as the Print button.
export function JobsWipEmailButton({ tableId, filterSummary }: { tableId: string; filterSummary: string }) {
  return <TableEmailButton tableId={tableId} title="Jobs & WIP" noun="job" endpoint="/api/v1/jobs/email-table" filterSummary={filterSummary === "No filters (all jobs)" ? "" : filterSummary} />;
}
