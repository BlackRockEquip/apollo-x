import { jobStatusLabelsFor, statusStepsForJobType } from "@/lib/jobs/ui";
import type { JobType } from "@prisma/client";
import { itemEffectiveType, summarizeFlowItems } from "@/lib/jobs/item-model";
import { jobStatusTone } from "@/components/StatusPill";

// 2026-10-29, user request (Engineering): when the items on one job are at different steps the job shows "Mixed" with a bar -
// one coloured segment per item, in the colour of that item's status - and how many are ready to deliver. When every item is at
// the same step the normal status pill is used instead (callers check itemsAreMixed first). Plain markup, no hooks, so the Jobs
// list (a server page) and the job screen both use it.

export function itemsAreMixed(statuses: readonly string[] | null | undefined): boolean {
  return !!statuses && statuses.length > 1 && new Set(statuses).size > 1;
}

export function ItemsStatusBadge({ statuses, jobType, build, size = "normal", itemTypes }: {
  statuses: readonly string[];
  jobType: string;
  build?: string | null;
  size?: "normal" | "compact";
  /** 2026-11-25: the job type each inside job works as (same order as `statuses`; empty / null = the job's own). Each is judged by its own steps. */
  itemTypes?: ReadonlyArray<string | null | undefined>;
}) {
  const labels = jobStatusLabelsFor(build as Parameters<typeof jobStatusLabelsFor>[0]);
  const rollup = summarizeFlowItems(statuses.map((status, index) => ({
    status,
    steps: statusStepsForJobType(itemEffectiveType(itemTypes?.[index], jobType) as JobType, build as Parameters<typeof statusStepsForJobType>[1]),
  })));
  // One segment per item, ordered by how far along it is.
  const ordered = rollup.counts.flatMap(({ status, count }) => Array.from({ length: count }, () => status));
  const detail = rollup.counts.map(({ status, count }) => `${count} ${labels[status as keyof typeof labels] ?? status}`).join(" · ");
  return (
    <span className={size === "compact" ? "ji-mixed compact" : "ji-mixed"} title={detail}>
      <span className="status-pill tone-neutral ji-mixed-pill">Mixed</span>
      <span className="ji-bar" role="img" aria-label={detail}>
        {ordered.map((status, index) => <span key={index} className={`ji-seg tone-${jobStatusTone(status)}`} />)}
      </span>
      <span className="ji-ready">{rollup.ready} of {rollup.total} ready</span>
    </span>
  );
}
