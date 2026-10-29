// The job screen's top-level tabs (design A, 2026-10-27). Pure helpers so the
// rules for which tabs exist, and which one is open, are testable on their own.

export type JobTabKey =
  | "overview"
  | "parts"
  | "pickslips"
  | "followup"
  | "outwork"
  | "specifications"
  | "attachments"
  | "pex"
  | "warranty"
  | "activity";

export type JobTab = { key: JobTabKey; label: string; count?: number; dot?: boolean };

export type JobTabInput = {
  showParts: boolean;
  showPickSlips: boolean;
  showFollowup: boolean;
  showOutwork: boolean;
  showSpecifications: boolean;
  showPex: boolean;
  showWarranty: boolean;
  showActivity: boolean;
  partsCount: number;
  pickSlipsCount: number;
  followupCount: number;
  outworkCount: number;
  attachmentsCount: number;
  /** 2026-10-29, Engineering item view: tabs are named like the item mockup and the counts follow the selected item. */
  itemView?: boolean;
  reportsCount?: number;
  activityCount?: number;
};

export const JOB_TAB_KEYS: JobTabKey[] = ["overview", "parts", "pickslips", "followup", "outwork", "specifications", "attachments", "pex", "warranty", "activity"];

export function buildJobTabs(input: JobTabInput): JobTab[] {
  const itemView = !!input.itemView;
  const tabs: JobTab[] = [{ key: "overview", label: itemView ? "Details" : "Overview" }];
  if (input.showParts) tabs.push({ key: "parts", label: itemView ? "Parts" : "Parts list", count: input.partsCount });
  if (input.showPickSlips) tabs.push({ key: "pickslips", label: "Pick slips", count: input.pickSlipsCount });
  if (input.showFollowup) tabs.push({ key: "followup", label: "Follow-up", count: input.followupCount });
  if (input.showOutwork) tabs.push({ key: "outwork", label: "Outwork", count: input.outworkCount });
  if (input.showSpecifications) tabs.push({ key: "specifications", label: "Specifications", ...(itemView && typeof input.reportsCount === "number" ? { count: input.reportsCount } : {}) });
  tabs.push({ key: "attachments", label: itemView ? "Photos & files" : "Photos & attachments", count: input.attachmentsCount });
  if (input.showPex) tabs.push({ key: "pex", label: "PEX" });
  if (input.showWarranty) tabs.push({ key: "warranty", label: "Warranty" });
  if (input.showActivity) tabs.push({ key: "activity", label: "Activity", ...(itemView && typeof input.activityCount === "number" ? { count: input.activityCount } : {}) });
  return tabs;
}

// The requested tab if it exists for this job, else Overview — so a stale
// #tab=followup link never leaves the page blank once nothing is outstanding.
export function resolveActiveTab(requested: string | null | undefined, tabs: JobTab[]): JobTabKey {
  const found = tabs.find((tab) => tab.key === requested);
  return found ? found.key : "overview";
}

// "#tab=parts" -> "parts"; anything else -> null.
export function tabFromHash(hash: string | null | undefined): JobTabKey | null {
  const match = /^#?tab=([a-z]+)$/.exec((hash ?? "").trim());
  if (!match) return null;
  return (JOB_TAB_KEYS as string[]).includes(match[1]) ? (match[1] as JobTabKey) : null;
}

export function hashForTab(key: JobTabKey): string {
  return key === "overview" ? "" : `#tab=${key}`;
}
