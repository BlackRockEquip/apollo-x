import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

const url = process.env.DATABASE_URL_TEST;
if (!url) throw new Error("DATABASE_URL_TEST is required");
const db = new PrismaClient({ datasources: { db: { url } } });

describe("Phase 4A Step 3A schema integrity", () => {
  beforeAll(async () => {
    await db.$connect();
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("enforces return disposition by allocation movement kind", async () => {
    const issueCheck = await db.$queryRawUnsafe<Array<{ conname: string }>>(`
      SELECT conname
      FROM pg_constraint
      WHERE conname = 'JobPartAllocationMovement_kind_return_disposition_chk'
    `);
    expect(issueCheck).toHaveLength(1);
  });

  it("creates tenant lineage constraints for job part allocation tables", async () => {
    const constraints = await db.$queryRawUnsafe<Array<{ conname: string }>>(`
      SELECT conname
      FROM pg_constraint
      WHERE conname IN (
        'JobPartAllocation_requirement_lineage_fkey',
        'JobPartAllocation_reservation_tenant_lineage_fkey',
        'JobPartAllocationMovement_allocation_tenant_fkey',
        'JobPartAllocationMovement_stockMovement_tenant_fkey'
      )
      ORDER BY conname ASC
    `);
    expect(constraints.map((x) => x.conname)).toEqual([
      'JobPartAllocationMovement_allocation_tenant_fkey',
      'JobPartAllocationMovement_stockMovement_tenant_fkey',
      'JobPartAllocation_requirement_lineage_fkey',
      'JobPartAllocation_reservation_tenant_lineage_fkey',
    ]);
  });
});