import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { addStarterTestTemplates } from "@/lib/testing/service";

// Adds the starter spec templates (777D, R1700G, 120K to 160K) the company does not have yet.
export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    return NextResponse.json(await addStarterTestTemplates(await requireRequestContext()), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
