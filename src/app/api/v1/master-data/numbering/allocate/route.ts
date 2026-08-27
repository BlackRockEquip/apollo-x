import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { allocateDocumentNumber } from "@/lib/master-data/service";
const input=z.object({type:z.enum(["JOB","PEX_JOB","QUOTE","SALES_ORDER","INVOICE","PAYMENT_RECEIPT","PROCUREMENT_RFQ"])});
export async function POST(request:NextRequest){try{requireSameOrigin(request);const ctx=await requireRequestContext();const value=input.parse(await request.json());return NextResponse.json({number:await allocateDocumentNumber(ctx,value.type)});}catch(error){return apiError(error);}}
