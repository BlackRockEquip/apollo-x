import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { deleteMasterRecord, deletePart, updateMaster, type MasterKind } from "@/lib/master-data/service";
const kinds=new Set(["customers","suppliers","parts","manufacturers","storage-locations","services","tax-codes","commercial-terms","numbering"]);
export async function PATCH(request:NextRequest,{params}:{params:Promise<{kind:string;id:string}>}) { try { requireSameOrigin(request); const ctx=await requireRequestContext(); const p=await params; if(!kinds.has(p.kind)) throw new Error("NOT_FOUND"); return NextResponse.json(await updateMaster(ctx,p.kind as MasterKind,p.id,await request.json())); } catch(error){return apiError(error);} }
// 2026-09-10 — per-row delete. Parts had this first (see deletePart in
// master-data/service.ts for the hard-delete with automatic historical-
// reference fallback); Manufacturers and Storage Locations now have their
// own delete buttons too (see deleteMasterRecord — same hard-delete-then-
// deactivate shape, reusing the `active` flag as the fallback target since
// neither model has a dedicated historical-reference status). Every other
// kind still has no delete UI and 404s here rather than silently no-op-ing.
export async function DELETE(request:NextRequest,{params}:{params:Promise<{kind:string;id:string}>}) {
  try {
    requireSameOrigin(request);
    const ctx=await requireRequestContext();
    const p=await params;
    if (p.kind === "parts") return NextResponse.json(await deletePart(ctx, p.id));
    if (p.kind === "manufacturers" || p.kind === "storage-locations") return NextResponse.json(await deleteMasterRecord(ctx, p.kind, p.id));
    throw new Error("NOT_FOUND");
  } catch(error){return apiError(error);}
}
