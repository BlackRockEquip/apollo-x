import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { createMaster, deleteAllParts, listMaster, type MasterKind } from "@/lib/master-data/service";

const kinds = new Set(["customers","suppliers","parts","manufacturers","storage-locations","services","tax-codes","commercial-terms","numbering"]);
function kind(value:string): MasterKind { if(!kinds.has(value)) throw new Error("NOT_FOUND"); return value as MasterKind; }
export async function GET(request:NextRequest,{params}:{params:Promise<{kind:string}>}) { try { const ctx=await requireRequestContext(); const k=kind((await params).kind); return NextResponse.json(await listMaster(ctx,k,Object.fromEntries(request.nextUrl.searchParams))); } catch(error){return apiError(error);} }
export async function POST(request:NextRequest,{params}:{params:Promise<{kind:string}>}) { try { requireSameOrigin(request); const ctx=await requireRequestContext(); const k=kind((await params).kind); return NextResponse.json(await createMaster(ctx,k,await request.json()),{status:201}); } catch(error){return apiError(error);} }
// 2026-09-10 — bulk "Delete all" button on the merged Stock Levels page.
// Parts-only, same as the per-row DELETE on [kind]/[id]/route.ts; other
// kinds 404 here since there's no bulk-delete UI for them yet.
export async function DELETE(request:NextRequest,{params}:{params:Promise<{kind:string}>}) { try { requireSameOrigin(request); const ctx=await requireRequestContext(); const k=(await params).kind; if(k!=="parts") throw new Error("NOT_FOUND"); return NextResponse.json(await deleteAllParts(ctx)); } catch(error){return apiError(error);} }
