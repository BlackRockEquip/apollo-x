// 2026-10-29, user request: "a demo site that a user can operate / view the system live with no login details ...
// they can not do uploads or anything, basically just a live demo view, demo data only for now."
//
// Demo mode is switched on ONLY on a separate Render web service with its own database (see docs/demo-site.md),
// never on the live app. When DEMO_MODE=true:
//   - /demo signs a visitor straight into the demo company, "Ridgeline Plant Services" (scripts/seed-demo-company.ts) with no password;
//   - every request that could change something (POST/PUT/PATCH/DELETE: saves, uploads, emails, deletes) is refused
//     in src/proxy.ts before it reaches any route;
//   - the database client refuses writes as a second safety net (src/lib/prisma.ts), except sign-in sessions;
//   - the login, password reset and Platform screens are not reachable.
//
// This file is imported by src/proxy.ts, so it must stay free of database / Node-only imports.

export const DEMO_COMPANY_CODE = "TEST_DEMO";
export const DEMO_EMAIL_DOMAIN = "ridgelineplant.example"; // must match EMAIL_DOMAIN in scripts/seed-demo-company.ts

export const DEMO_READ_ONLY_CODE = "DEMO_READ_ONLY";
export const DEMO_READ_ONLY_MESSAGE = "This is a view-only demo. Saving, uploading, emailing and deleting are switched off.";

/** The demo logins a visitor can look through, keyed by the ?as= value. Emails match scripts/seed-demo-company.ts. */
export const DEMO_VIEWS = [
  { key: "admin", label: "Company admin", email: `admin@${DEMO_EMAIL_DOMAIN}` },
  { key: "manager", label: "Manager / Foreman", email: `manager@${DEMO_EMAIL_DOMAIN}` },
  { key: "sales", label: "Sales", email: `sales@${DEMO_EMAIL_DOMAIN}` },
  { key: "stores", label: "Store controller", email: `stores@${DEMO_EMAIL_DOMAIN}` },
  { key: "mechanic", label: "Mechanic", email: `mechanic@${DEMO_EMAIL_DOMAIN}` },
] as const;

export type DemoViewKey = (typeof DEMO_VIEWS)[number]["key"];

export function demoViewFor(key: string | null | undefined) {
  return DEMO_VIEWS.find((view) => view.key === key) ?? DEMO_VIEWS[0];
}

const VIEW_BY_ROLE: Record<string, DemoViewKey> = {
  COMPANY_ADMIN: "admin", MANAGER: "manager", SALES: "sales", STORE_CONTROLLER: "stores", USER: "mechanic",
};

/** Which demo view the signed-in demo user is (for the banner's "Viewing as" picker). */
export function demoViewKeyForRole(role: string | null | undefined): DemoViewKey {
  return (role && VIEW_BY_ROLE[role]) || "admin";
}

export function isDemoMode(env: Record<string, string | undefined> = process.env) {
  return env.DEMO_MODE === "true";
}

/** The database write guard is on in demo mode, except while the demo seed itself is running (DEMO_SEEDING=1). */
export function isDemoWriteGuardOn(env: Record<string, string | undefined> = process.env) {
  return isDemoMode(env) && env.DEMO_SEEDING !== "1";
}

/** Where the "Request a demo" button in the demo banner goes. */
export function demoCtaUrl(env: Record<string, string | undefined> = process.env) {
  const url = env.DEMO_CTA_URL?.trim();
  return url && /^https?:\/\//i.test(url) ? url : "https://www.floxintegrations.co.za/#contact";
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Paths a signed-out demo visitor may reach without being sent through /demo first. */
const DEMO_PUBLIC_PATHS = ["/demo", "/api/v1/health", "/api/v1/company-settings/favicon", "/api/v1/storage-files"];

/** Pages that make no sense in a public demo; visitors are sent back into the demo instead. */
const DEMO_BLOCKED_PAGES = ["/login", "/reset-password", "/platform"];

function matches(pathname: string, path: string) {
  return pathname === path || pathname.startsWith(`${path}/`);
}

export type DemoProxyDecision =
  | { kind: "block-write" }
  | { kind: "redirect"; location: string }
  | { kind: "next" };

/**
 * What the proxy does with one request in demo mode. Pure, so it can be unit-tested.
 * - anything but GET/HEAD/OPTIONS is refused (saves, uploads, emails, deletes, server actions, sign-out);
 * - /login, /reset-password and /platform go back into the demo;
 * - a signed-out visitor is signed in through /demo and then lands on the page they asked for.
 */
export function demoProxyDecision(method: string, pathname: string, search: string, hasSession: boolean): DemoProxyDecision {
  if (!SAFE_METHODS.has(method.toUpperCase())) return { kind: "block-write" };
  if (DEMO_BLOCKED_PAGES.some((path) => matches(pathname, path))) return { kind: "redirect", location: "/demo" };
  if (DEMO_PUBLIC_PATHS.some((path) => matches(pathname, path))) return { kind: "next" };
  if (!hasSession) {
    const next = pathname === "/" || pathname.startsWith("/api/") ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return { kind: "redirect", location: `/demo${next}` };
  }
  return { kind: "next" };
}

/** Only same-site paths are followed after signing in (no "//evil.example" or absolute URLs). */
export function safeDemoNext(next: string | null | undefined) {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  if (DEMO_BLOCKED_PAGES.some((path) => matches(next.split("?")[0], path)) || matches(next.split("?")[0], "/demo")) return null;
  return next;
}

// --- Database write guard ---------------------------------------------------------------------------------------

/** Tables the running demo may still write: sign-in sessions (and the demo entry's rate limit counter). */
const DEMO_WRITABLE_MODELS = new Set(["UserSession", "LoginThrottle"]);

const WRITE_OPERATIONS = new Set([
  "create", "createMany", "createManyAndReturn", "update", "updateMany", "updateManyAndReturn", "upsert", "delete", "deleteMany",
]);

export function isBlockedDemoWrite(model: string | undefined, operation: string) {
  return WRITE_OPERATIONS.has(operation) && !(model && DEMO_WRITABLE_MODELS.has(model));
}

/** Pulls the SQL text out of a $queryRaw / $executeRaw call's arguments (template or Prisma.sql or plain string). */
export function rawSqlText(args: unknown): string {
  const first = Array.isArray(args) ? args[0] : args;
  if (typeof first === "string") return first;
  if (first && typeof first === "object") {
    const value = first as { sql?: unknown; strings?: unknown };
    if (typeof value.sql === "string") return value.sql;
    if (Array.isArray(value.strings)) return value.strings.join(" ");
    if (Array.isArray(first)) return (first as unknown[]).join(" ");
  }
  return "";
}

/** True when raw SQL could change data. Unreadable SQL counts as a write, so the guard fails closed. */
export function isWritingSql(sql: string) {
  const text = sql.replace(/--[^\n]*\n?/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ").trim();
  if (!text) return true;
  if (!/^(select|with|show|explain)\b/i.test(text)) return true;
  // A read can still hide a write (WITH ... UPDATE, SELECT ... FOR UPDATE). Column names such as "updatedAt" or
  // "createdAt" do not match because the keyword must stand on its own.
  return /\b(insert|update|delete|truncate|alter|drop|create|grant|revoke|merge|copy|lock)\b/i.test(text);
}

export class DemoReadOnlyError extends Error {
  constructor() {
    super(DEMO_READ_ONLY_CODE);
    this.name = "DemoReadOnlyError";
  }
}
