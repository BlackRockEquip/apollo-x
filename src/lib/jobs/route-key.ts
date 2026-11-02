import { prisma } from "@/lib/prisma";

// The job page's address part is a job number (BRE1182) or - for an old bookmark, an email link or a job that has no number - the
// job's id. Finds the job either way, inside the signed-in company only.
export type JobRouteMatch = { id: string; jobNumber: string | null };

export async function resolveJobRouteKey(companyId: string, rawKey: string): Promise<JobRouteMatch | null> {
  let key = rawKey;
  try { key = decodeURIComponent(rawKey); } catch { /* keep the raw text */ }
  key = key.trim();
  if (!key) return null;
  const rows = await prisma.job.findMany({
    where: { companyId, OR: [{ jobNumber: { equals: key, mode: "insensitive" } }, { id: key }] },
    select: { id: true, jobNumber: true },
    take: 2,
  });
  // An exact job-number match wins over an id match (an id can never look like a job number in practice).
  return rows.find((row) => row.jobNumber === key) ?? rows[0] ?? null;
}

// Where the page should really live: the job-number address, when the job has a number and the address used was something else.
export function canonicalJobPath(match: JobRouteMatch, usedKey: string, search: Record<string, string | string[] | undefined> = {}): string | null {
  const number = match.jobNumber?.trim();
  let used = usedKey;
  try { used = decodeURIComponent(usedKey); } catch { /* keep */ }
  if (!number || used === number) return null;
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(search)) {
    if (Array.isArray(value)) value.forEach((v) => query.append(name, v));
    else if (value !== undefined) query.append(name, value);
  }
  const text = query.toString();
  return `/jobs/${encodeURIComponent(number)}${text ? `?${text}` : ""}`;
}
