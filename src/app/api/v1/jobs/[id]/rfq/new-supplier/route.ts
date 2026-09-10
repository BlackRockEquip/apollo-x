import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { addSupplierAndRequestRfq } from "@/lib/rfq/service";

// Inline "create a new supplier and request a quote" from the RFQ panel —
// added 2026-09-09 (user request: "No inline 'create new supplier' from
// the RFQ panel"). Body: { supplierName, supplierEmail?, sendEmail? }.
// Creates the Supplier via the same master-data path as the Suppliers
// screen, so it requires SUPPLIERS_CREATE as well as the usual JOBS_EDIT
// permission (see addSupplierAndRequestRfq in rfq/service.ts).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const { id } = await params;
    return NextResponse.json(await addSupplierAndRequestRfq(await requireRequestContext(), id, await request.json()), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
