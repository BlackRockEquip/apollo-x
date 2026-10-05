import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { getDocumentTitles, updateDocumentTitles } from "@/lib/documents/titles-service";

// Document titles (Org Admin > Configuration > Document titles). GET is open to
// every signed-in user of the company because printing and saving documents
// needs them; PUT is an Org Admin action (COMPANY_SETTINGS_EDIT).
export async function GET() {
  try {
    return NextResponse.json(await getDocumentTitles(await requireRequestContext()));
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    requireSameOrigin(request);
    return NextResponse.json(await updateDocumentTitles(await requireRequestContext(), await request.json()));
  } catch (error) {
    return apiError(error);
  }
}
