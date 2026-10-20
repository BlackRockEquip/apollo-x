import type { RequestContext } from "@/lib/auth/context-types";

// 2026-10-20, user request: "allow only Platform admins to create users for any company, so only platform admins can manage users".
// Adding, changing, resetting and removing a company's users is allowed only inside a read-write Flo X platform support session
// for that company (session.ts sets supportMode only for a platform admin with the support-write permission). A company's own admin
// - or anyone else logged in as that company - gets "no".
export function canManageCompanyUsers(ctx: Pick<RequestContext, "supportMode">): boolean {
  return ctx.supportMode === "READ_WRITE";
}
