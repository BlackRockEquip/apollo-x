import type { TenantRole } from "@prisma/client";

// ---------------------------------------------------------------------------
// 2026-11-25, user request: "Build this that it is a module that can be turned on and off, only visible to company
// administrators that have it enabled on their user profile."
//
// Commissions is switched on or off for a company like every other optional module (Platform > Companies > company >
// Industry build tile). On top of that it is OPT-IN per user: nobody sees it until it is switched on in their own user
// profile, and only a Company Administrator can have it switched on. Every other module works the other way round (on
// unless switched off for the user, stored as a MODULE_OFF marker - see permissions.ts), so this module has its own marker:
//
//   MembershipPermission { permission: "MODULE_ON:COMMISSIONS", allowed: true }
//
// session.ts applies commissionsAllowedForMember() after the company licence: when it says no, the module is DENIED for that
// session, so the menu, the page and every API route all follow (they check ctx.moduleAccess). A platform support session
// never gets it either: commission and pay figures stay with the company's own chosen admins.
// ---------------------------------------------------------------------------

export const COMMISSIONS_OPT_IN = "MODULE_ON:COMMISSIONS";

/** Module keys that are off for a user unless switched on for them (the opposite of every other module). */
export const OPT_IN_MODULE_KEYS = ["COMMISSIONS"] as const;

/** Only these user types can have an opt-in module switched on. */
export const OPT_IN_ROLES: readonly TenantRole[] = ["COMPANY_ADMIN"];

type PermissionRow = { permission: string; allowed: boolean };

export function isOptInModule(moduleKey: string): boolean {
  return (OPT_IN_MODULE_KEYS as readonly string[]).includes(moduleKey);
}

export function roleCanOptIn(role: TenantRole | string | null | undefined): boolean {
  return Boolean(role) && (OPT_IN_ROLES as readonly string[]).includes(role as string);
}

export function hasCommissionsOptIn(rows: ReadonlyArray<PermissionRow>): boolean {
  return rows.some((row) => row.allowed && row.permission === COMMISSIONS_OPT_IN);
}

/** Is Commissions switched on for this company member (before the company licence, which session.ts checks first)? */
export function commissionsAllowedForMember(input: { role: TenantRole | null | undefined; rows: ReadonlyArray<PermissionRow>; supportSession?: boolean }): boolean {
  if (input.supportSession) return false;
  return roleCanOptIn(input.role) && hasCommissionsOptIn(input.rows);
}

/** The opt-in rows to store for a user save: the marker when Commissions is selected and the user type allows it, otherwise nothing. */
export function optInRows(role: TenantRole, moduleKeys: readonly string[]): PermissionRow[] {
  return roleCanOptIn(role) && moduleKeys.includes("COMMISSIONS") ? [{ permission: COMMISSIONS_OPT_IN, allowed: true }] : [];
}
