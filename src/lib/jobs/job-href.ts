// The address of a job's page. 2026-11-02, user request: "when I create a job, the link is not the job number - can it be the new job
// number?" - a job opens at /jobs/BRE1182 instead of /jobs/cmvz7ovqv055d6x135i5hggxk. A job without a number yet (and any old
// bookmark) still opens by its id; the job page then moves it to the number address.
export function jobHref(job: { id: string; jobNumber?: string | null }): string {
  const number = job.jobNumber?.trim();
  return `/jobs/${encodeURIComponent(number || job.id)}`;
}
