// PEX Stock is listed newest job first. 2026-10-28, user request: "sort the
// table by Job# (newest job to oldest job)". A job number is a prefix plus a
// sequence ("BRE999", "BRE1000"), so a plain string sort puts BRE999 ahead of
// BRE1000; the trailing digits are compared as a number instead (same rule as
// the Jobs & WIP list). Units whose job has no number (still a draft) go last.

export function jobNumberSortValue(jobNumber: string | null | undefined): number {
  const match = jobNumber?.match(/(\d+)(?!.*\d)/);
  return match ? parseInt(match[1], 10) : -1;
}

type Sortable = { updatedAt?: Date | string | null; returnJob?: { jobNumber?: string | null } | null };

export function sortPexStockNewestFirst<T extends Sortable>(rows: T[]): T[] {
  const time = (value: Date | string | null | undefined) => (value ? new Date(value).getTime() || 0 : 0);
  return rows.slice().sort((a, b) => {
    const byJob = jobNumberSortValue(b.returnJob?.jobNumber) - jobNumberSortValue(a.returnJob?.jobNumber);
    return byJob !== 0 ? byJob : time(b.updatedAt) - time(a.updatedAt);
  });
}
