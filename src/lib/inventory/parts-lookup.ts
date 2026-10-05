import type { Prisma, PrismaClient } from "@prisma/client";
import { looseNormalized, normalized } from "@/lib/master-data/validation";

// New — 2026-09-29, at the user's request ("how can we add additional
// part numbers for parts that have superseded numbers and also have
// group numbers... two different numbers but have multiple entries?").
// A part can be known by more than its own catalog number — a
// manufacturer discontinues one number and reissues the same part under
// a new one (SUPERSEDED), or a number covers a broader interchangeable
// family/kit (GROUP). Rather than creating a second Part record per
// number (which would split stock, history and reorder settings across
// records for what's physically the same item), PartAlternateNumber
// rows just give the SAME Part more ways to be found — see that model's
// own comment in schema.prisma.
//
// findPartByNumber is the one place that resolution happens, used
// everywhere a person types or imports a raw part number rather than
// picking a part from a list — Stock Levels search, adding a part to a
// job, job kits, RFQ part matching, Excel/CSV import — so a superseded
// or group number resolves to the exact same part its current number
// would. The common case (typing the part's own current number) costs
// exactly the one query it always did; the alternate-number fallback
// only runs when that first lookup misses.
type Client = PrismaClient | Prisma.TransactionClient;

export async function findPartByNumber<T extends Prisma.PartSelect>(
  client: Client,
  companyId: string,
  rawNumber: string,
  select: T
): Promise<Prisma.PartGetPayload<{ select: T }> | null> {
  // 2026-10-05, user report (BRE1071 / 4D3107): a job line was linked to an
  // inactive/historical part record (a "deleted" part keeps its row, see
  // deletePart), so a pick slip skipped it as "inactive" while Stock Levels
  // showed the live 4D3107. Every tier below could land on that hidden record
  // before ever considering the live one. Look for an ACTIVE, operational part
  // through all tiers first; only if there is none, fall back to the old
  // behaviour of returning whatever matches (so an inactive-only match still
  // resolves exactly as before).
  const activeHit = await lookup(client, companyId, rawNumber, select, true);
  if (activeHit) return activeHit;
  return lookup(client, companyId, rawNumber, select, false);
}

async function lookup<T extends Prisma.PartSelect>(
  client: Client,
  companyId: string,
  rawNumber: string,
  select: T,
  activeOnly: boolean
): Promise<Prisma.PartGetPayload<{ select: T }> | null> {
  const activeWhere = activeOnly ? { active: true, operationalStatus: "OPERATIONAL" as const } : {};
  const numberNormalized = normalized(rawNumber);
  if (!numberNormalized) return null;
  const direct = await client.part.findFirst({ where: { companyId, partNumberNormalized: numberNormalized, ...activeWhere }, select });
  if (direct) return direct;
  const alt = await client.partAlternateNumber.findFirst({ where: { companyId, numberNormalized }, select: { partId: true } });
  if (alt) {
    const viaAlt = await client.part.findFirst({ where: { id: alt.partId, ...activeWhere }, select });
    if (viaAlt) return viaAlt;
  }

  // 2026-10-01 — user request: "the cross check with stock does not pickup
  // 3j1907 but does pickup 3J-1907... it should check all numbers
  // with/without hyphens, spaces, dashes etc that are in stock." The two
  // lookups above only ever match an exact (trimmed/uppercased) string, so
  // "3J1907" typed/pasted without the hyphen never matches a stored
  // "3J-1907". This third tier strips every non-alphanumeric character from
  // both sides (looseNormalized, see its own comment in validation.ts) and
  // compares that instead — done with a raw query rather than a Prisma
  // where-clause because the comparison has to run against a *computed*
  // (stripped) version of the stored column, which Prisma's query builder
  // can't express; regexp_replace does the stripping on the Postgres side so
  // this still only touches the rows for this company, same as the other
  // two lookups, and never changes what's actually stored. Only reached when
  // both exact-match tiers above have already missed, so the common case
  // (typing the part's real number) pays no extra cost.
  const loose = looseNormalized(rawNumber);
  if (!loose) return null;
  const loosePart = activeOnly
    ? await client.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Part" WHERE "companyId" = ${companyId} AND "active" = true AND "operationalStatus"::text = 'OPERATIONAL' AND regexp_replace("partNumberNormalized", '[^A-Z0-9]', '', 'g') = ${loose} LIMIT 1`
    : await client.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Part" WHERE "companyId" = ${companyId} AND regexp_replace("partNumberNormalized", '[^A-Z0-9]', '', 'g') = ${loose} LIMIT 1`;
  if (loosePart[0]) return client.part.findFirst({ where: { id: loosePart[0].id }, select });
  const looseAlts = await client.$queryRaw<{ partId: string }[]>`SELECT "partId" FROM "PartAlternateNumber" WHERE "companyId" = ${companyId} AND regexp_replace("numberNormalized", '[^A-Z0-9]', '', 'g') = ${loose} LIMIT 5`;
  for (const looseAlt of looseAlts) {
    const viaLooseAlt = await client.part.findFirst({ where: { id: looseAlt.partId, ...activeWhere }, select });
    if (viaLooseAlt) return viaLooseAlt;
  }
  return null;
}

// Same resolution, but only the id — for call sites that just need to
// know whether a typed/imported number matches an existing part at all
// (e.g. an import's "already exists" duplicate check) without pulling
// any other fields.
export async function resolvePartIdByNumber(client: Client, companyId: string, rawNumber: string): Promise<string | null> {
  const part = await findPartByNumber(client, companyId, rawNumber, { id: true });
  return part?.id ?? null;
}

// Checked both ways round a Part/PartAlternateNumber can collide, since
// only one direction is protected by a real DB constraint:
//   - creating a PartAlternateNumber: numberNormalized is unique per
//     company at the DB level across every OTHER alternate number (the
//     @@unique on PartAlternateNumber), but a real part's own
//     partNumberNormalized lives in a different table Postgres can't
//     cross-reference with that constraint.
//   - creating or renaming a Part: its own partNumberNormalized is
//     unique-constrained against every OTHER part, but nothing stops it
//     from being saved as the same string some OTHER part already lists
//     as one of ITS alternate numbers.
// Both are caught here instead, in application code. excludePartId lets
// an edit that keeps the same part number check only against everything
// ELSE (used when a Part's own number is being changed, not when a new
// PartAlternateNumber is being added to it).
export async function numberAlreadyInUse(client: Client, companyId: string, rawNumber: string, excludePartId?: string): Promise<boolean> {
  const numberNormalized = normalized(rawNumber);
  if (!numberNormalized) return false;
  const [part, alt] = await Promise.all([
    client.part.findFirst({ where: { companyId, partNumberNormalized: numberNormalized, ...(excludePartId ? { id: { not: excludePartId } } : {}) }, select: { id: true } }),
    // 2026-10-02 — user report: a part's own number change was getting
    // blocked as "already in use." One real cause: this half of the
    // check never excluded excludePartId's OWN alternate numbers, so
    // renaming a part's main number to equal one of its OWN existing
    // alternate numbers (e.g. simplifying away the need for a separate
    // alternate entry) collided with itself and threw
    // PART_NUMBER_ALREADY_IN_USE even though nothing else actually
    // holds that number. Still blocks a genuine collision with some
    // OTHER part's alternate number exactly as before.
    client.partAlternateNumber.findFirst({ where: { companyId, numberNormalized, ...(excludePartId ? { partId: { not: excludePartId } } : {}) }, select: { id: true } }),
  ]);
  return !!part || !!alt;
}
