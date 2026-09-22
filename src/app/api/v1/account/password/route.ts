import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { changeOwnPassword } from "@/lib/account/service";

// 2026-09-22 — user request: "Allow users to reset there own password."
// Any signed-in user (tenant or platform admin — requireRequestContext
// alone, no permission check) can change their own password given their
// current one. See ChangePasswordButton.tsx for the UI.
export async function PATCH(request: NextRequest) {
  try {
    requireSameOrigin(request);
    return NextResponse.json(await changeOwnPassword(await requireRequestContext(), await request.json()));
  } catch (error) {
    return apiError(error);
  }
}
