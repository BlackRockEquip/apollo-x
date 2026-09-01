import { Prisma } from "@prisma/client";

type JobStatus = Prisma.JobGetPayload<{ select: { status: true } }>["status"];
type JobType = Prisma.JobGetPayload<{ select: { type: true } }>["type"];

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  DRAFT: "Draft",
  TO_BE_COLLECTED: "To be collected",
  TO_BE_RECEIVED: "To be received",
  STRIPPING: "Stripping",
  QUOTE_IN_PROGRESS: "Quote in progress",
  AWAITING_GO_AHEAD: "Awaiting go-ahead",
  WAITING_FOR_PARTS: "Waiting for parts",
  ASSEMBLY: "Assembly",
  TESTING: "Testing",
  TO_BE_DELIVERED: "To be delivered",
  COMPLETE: "Complete",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
};

export const JOB_TYPE_LABELS: Record<JobType, string> = {
  STANDARD_REPAIR: "Standard repair",
  PARTIAL_REPAIR: "Partial repair",
  PEX_SUPPLY: "PEX supply",
  PEX_RETURN: "PEX return",
  OUTRIGHT_SALE: "Outright sale",
  FIELD_SERVICE: "Field service",
  WARRANTY: "Warranty",
};

export const JOB_WIP_FILTERS: Array<{ key: string; label: string; statuses?: JobStatus[] }> = [
  { key: "all", label: "All jobs" },
  { key: "drafts", label: "Drafts", statuses: ["DRAFT"] },
  { key: "collection", label: "Collection / receipt", statuses: ["TO_BE_COLLECTED", "TO_BE_RECEIVED"] },
  { key: "workshop", label: "Workshop", statuses: ["STRIPPING", "ASSEMBLY", "TESTING"] },
  { key: "commercial", label: "Quote / approval", statuses: ["QUOTE_IN_PROGRESS", "AWAITING_GO_AHEAD"] },
  { key: "parts", label: "Waiting for parts", statuses: ["WAITING_FOR_PARTS"] },
  { key: "delivery", label: "Delivery", statuses: ["TO_BE_DELIVERED"] },
  { key: "completed", label: "Completed / closed", statuses: ["COMPLETE", "CLOSED", "CANCELLED"] },
];