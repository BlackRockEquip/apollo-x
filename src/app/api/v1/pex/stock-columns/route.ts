import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { getPexStockColumns, savePexStockColumns, resetPexStockColumns } from "@/lib/pex/stock-columns-service";

// This user's column choice for the PEX Stock table (2026-10-28).
export async function GET() {
  try {
    return NextResponse.json({ columns: await getPexStockColumns(await requireRequestContext()) });
  } catch (error) {
    return apiError(error);
  }
}

// PUT {columns: string[]} - the five locked columns are always kept.
export async function PUT(request: NextRequest) {
  try {
    requireSameOrigin(request);
    const ctx = await requireRequestContext();
    return NextResponse.json({ columns: await savePexStockColumns(ctx, (await request.json()).columns) });
  } catch (error) {
    return apiError(error);
  }
}

// DELETE - back to the default columns.
export async function DELETE(request: NextRequest) {
  try {
    requireSameOrigin(request);
    return NextResponse.json({ columns: await resetPexStockColumns(await requireRequestContext()) });
  } catch (error) {
    return apiError(error);
  }
}
