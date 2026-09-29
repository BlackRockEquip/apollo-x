import type { Prisma, PrismaClient } from "@prisma/client";
import { normalized } from "@/lib/master-data/validation";

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
  const numberNormalized = normalized(rawNumber);
  if (!numberNormalized) return null;
  const direct = await client.part.findFirst({ where: { companyId, partNumberNormalized: numberNormalized }, select });
  if (direct) return direct;
  const alt = await client.partAlternateNumber.findFirst({ where: { companyId, numberNormalized }, select: { partId: true } });
  if (!alt) return null;
  return client.part.findFirst({ where: { id: alt.partId }, select });
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
    client.partAlternateNumber.findFirst({ where: { companyId, numberNormalized }, select: { id: true } }),
  ]);
  return !!part || !!alt;
}
