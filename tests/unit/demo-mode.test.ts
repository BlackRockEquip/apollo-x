import { describe, expect, it } from "vitest";
import {
  demoCtaUrl,
  demoProxyDecision,
  demoViewFor,
  demoViewKeyForRole,
  isBlockedDemoWrite,
  isDemoMode,
  isDemoWriteGuardOn,
  isWritingSql,
  rawSqlText,
  safeDemoNext,
} from "@/lib/demo/mode";

describe("demo mode switch", () => {
  it("is only on when DEMO_MODE is exactly true", () => {
    expect(isDemoMode({})).toBe(false);
    expect(isDemoMode({ DEMO_MODE: "1" })).toBe(false);
    expect(isDemoMode({ DEMO_MODE: "TRUE" })).toBe(false);
    expect(isDemoMode({ DEMO_MODE: "true" })).toBe(true);
  });
  it("lets the seed write while DEMO_SEEDING=1", () => {
    expect(isDemoWriteGuardOn({ DEMO_MODE: "true" })).toBe(true);
    expect(isDemoWriteGuardOn({ DEMO_MODE: "true", DEMO_SEEDING: "1" })).toBe(false);
    expect(isDemoWriteGuardOn({ DEMO_SEEDING: "1" })).toBe(false);
  });
  it("only accepts http(s) call-to-action links", () => {
    expect(demoCtaUrl({ DEMO_CTA_URL: "javascript:alert(1)" })).toBe("https://www.floxintegrations.co.za/#contact");
    expect(demoCtaUrl({ DEMO_CTA_URL: "https://example.com/contact" })).toBe("https://example.com/contact");
  });
});

describe("demo proxy decision", () => {
  it("refuses every write method, signed in or not", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "post"]) {
      expect(demoProxyDecision(method, "/api/v1/jobs/abc/attachments", "", true)).toEqual({ kind: "block-write" });
      expect(demoProxyDecision(method, "/api/v1/auth/login", "", false)).toEqual({ kind: "block-write" });
    }
  });
  it("sends login, password reset and platform pages back into the demo", () => {
    expect(demoProxyDecision("GET", "/login", "", false)).toEqual({ kind: "redirect", location: "/demo" });
    expect(demoProxyDecision("GET", "/reset-password", "?token=x", false)).toEqual({ kind: "redirect", location: "/demo" });
    expect(demoProxyDecision("GET", "/platform/companies", "", true)).toEqual({ kind: "redirect", location: "/demo" });
  });
  it("signs a signed-out visitor in and returns them to the page they opened", () => {
    expect(demoProxyDecision("GET", "/", "", false)).toEqual({ kind: "redirect", location: "/demo" });
    expect(demoProxyDecision("GET", "/jobs", "?status=open", false)).toEqual({ kind: "redirect", location: "/demo?next=%2Fjobs%3Fstatus%3Dopen" });
    expect(demoProxyDecision("GET", "/api/v1/jobs", "", false)).toEqual({ kind: "redirect", location: "/demo" });
  });
  it("lets the demo entry and health check through without a session", () => {
    expect(demoProxyDecision("GET", "/demo", "?as=mechanic", false)).toEqual({ kind: "next" });
    expect(demoProxyDecision("GET", "/api/v1/health", "", false)).toEqual({ kind: "next" });
  });
  it("lets signed-in reads through", () => {
    expect(demoProxyDecision("GET", "/jobs/abc", "", true)).toEqual({ kind: "next" });
    expect(demoProxyDecision("HEAD", "/dashboard", "", true)).toEqual({ kind: "next" });
  });
});

describe("demo entry helpers", () => {
  it("only follows same-site paths after signing in", () => {
    expect(safeDemoNext("/jobs?x=1")).toBe("/jobs?x=1");
    expect(safeDemoNext("//evil.example")).toBeNull();
    expect(safeDemoNext("/\\evil.example")).toBeNull();
    expect(safeDemoNext("https://evil.example")).toBeNull();
    expect(safeDemoNext("/platform")).toBeNull();
    expect(safeDemoNext("/demo?as=admin")).toBeNull();
    expect(safeDemoNext(null)).toBeNull();
  });
  it("maps views and roles", () => {
    expect(demoViewFor("mechanic").email).toBe("mechanic@ridgelineplant.example");
    expect(demoViewFor("finance").key).toBe("admin"); // Finance is not offered
    expect(demoViewFor("nope").key).toBe("admin");
    expect(demoViewKeyForRole("STORE_CONTROLLER")).toBe("stores");
    expect(demoViewKeyForRole("WIP_VIEWER")).toBe("admin");
    expect(demoViewKeyForRole("FINANCE")).toBe("admin");
  });
});

describe("database write guard", () => {
  it("blocks writes except sign-in sessions and the entry limiter", () => {
    expect(isBlockedDemoWrite("Job", "update")).toBe(true);
    expect(isBlockedDemoWrite("JobAttachment", "create")).toBe(true);
    expect(isBlockedDemoWrite("Customer", "deleteMany")).toBe(true);
    expect(isBlockedDemoWrite("Job", "findMany")).toBe(false);
    expect(isBlockedDemoWrite("Job", "count")).toBe(false);
    expect(isBlockedDemoWrite("UserSession", "create")).toBe(false);
    expect(isBlockedDemoWrite("LoginThrottle", "upsert")).toBe(false);
    expect(isBlockedDemoWrite(undefined, "create")).toBe(true);
  });
  it("tells raw reads from raw writes", () => {
    expect(isWritingSql(`SELECT "doneAt", "createdAt", "updatedAt" FROM "Job" WHERE id = $1`)).toBe(false);
    expect(isWritingSql(`WITH x AS (SELECT 1) SELECT * FROM x`)).toBe(false);
    expect(isWritingSql(`UPDATE "DocumentNumberSequence" SET "nextValue"="nextValue"+1 RETURNING id`)).toBe(true);
    expect(isWritingSql(`INSERT INTO "InventoryPosition" (id) VALUES ($1) RETURNING id`)).toBe(true);
    expect(isWritingSql(`WITH x AS (UPDATE t SET a = 1 RETURNING *) SELECT * FROM x`)).toBe(true);
    expect(isWritingSql(`SELECT * FROM "InventoryPosition" WHERE id = $1 FOR UPDATE`)).toBe(true);
    expect(isWritingSql(`  -- comment\n SELECT 1`)).toBe(false);
    expect(isWritingSql("")).toBe(true);
  });
  it("reads SQL text from the shapes Prisma passes", () => {
    expect(rawSqlText(["SELECT 1"])).toBe("SELECT 1");
    expect(rawSqlText([{ sql: "SELECT $1", values: [1] }])).toBe("SELECT $1");
    expect(rawSqlText([{ strings: ["SELECT ", " FROM t"], values: [1] }])).toBe("SELECT   FROM t");
    expect(rawSqlText([[`UPDATE t SET a = `, ``]])).toBe("UPDATE t SET a =  ");
  });
});
