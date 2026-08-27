import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { updateMaster, type MasterKind } from "@/lib/master-data/service";
const kinds=new Set(["customers","suppliers","parts","manufacturers","storage-locations","services","tax-codes","commercial-terms","numbering"]);
export async function PATCH(request:NextRequest,{params}:{params:Promise<{kind:string;id:string}>}) { try { requireSameOrigin(request); const ctx=await requireRequestContext(); const p=await params; if(!kinds.has(p.kind)) throw new Error("NOT_FOUND"); return NextResponse.json(await updateMaster(ctx,p.kind as MasterKind,p.id,await request.json())); } catch(error){return apiError(error);} }
