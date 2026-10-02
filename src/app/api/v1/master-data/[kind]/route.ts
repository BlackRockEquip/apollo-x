import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { createMaster, deleteAllParts, deleteAllMasterRecords, listMaster, type MasterKind } from "@/lib/master-data/service";

const kinds = new Set(["customers","suppliers","parts","manufacturers","storage-locations","services","tax-codes","commercial-terms","numbering"]);
function kind(value:string): MasterKind { if(!kinds.has(value)) throw new Error("NOT_FOUND"); return value as MasterKind; }
export async function GET(request:NextRequest,{params}:{params:Promise<{kind:string}>}) { try { const ctx=await requireRequestContext(); const k=kind((await params).kind); return NextResponse.json(await listMaster(ctx,k,Object.fromEntries(request.nextUrl.searchParams))); } catch(error){return apiError(error);} }
export async function POST(request:NextRequest,{params}:{params:Promise<{kind:string}>}) { try { requireSameOrigin(request); const ctx=await requireRequestContext(); const k=kind((await params).kind); return NextResponse.json(await createMaster(ctx,k,await request.json()),{status:201}); } catch(error){return apiError(error);} }
// 2026-09-10 — bulk "Delete all" button on the merged Stock Levels page
// (Parts). 2026-10-02 — user request: "create a bulk delete button" for
// Storage Locations too — extended to also dispatch "storage-locations"
// (and "manufacturers", which gets the same bulk action for free, same
// as the per-row DELETE on [kind]/[id]/route.ts already covering both)
// to deleteAllMasterRecords. Every other kind still 404s here — no
// bulk-delete UI exists for them.
export async function DELETE(request:NextRequest,{params}:{params:Promise<{kind:string}>}) { try { requireSameOrigin(request); const ctx=await requireRequestContext(); const k=(await params).kind; if(k==="parts") return NextResponse.json(await deleteAllParts(ctx)); if(k==="manufacturers"||k==="storage-locations") return NextResponse.json(await deleteAllMasterRecords(ctx,k)); throw new Error("NOT_FOUND"); } catch(error){return apiError(error);} }
