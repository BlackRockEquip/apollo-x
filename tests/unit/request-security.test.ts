import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { publicOriginForLinks, requireSameOrigin } from "@/lib/security/request";
import { AuthorizationError } from "@/lib/auth/guards";

describe("same-origin mutation protection", () => {
  it("accepts a matching origin", () => {
    const request = new NextRequest("https://apollo.example/api/v1/test", { headers: { origin: "https://apollo.example" } });
    expect(() => requireSameOrigin(request)).not.toThrow();
  });

  it("accepts a valid 127.0.0.1 origin when runtime canonicalizes loopback to localhost", () => {
    const request = new NextRequest("http://localhost:3000/api/v1/auth/login", {
      headers: {
        origin: "http://127.0.0.1:3000",
        host: "127.0.0.1:3000",
        "x-forwarded-host": "127.0.0.1:3000",
        "x-forwarded-proto": "http",
      },
    });
    expect(() => requireSameOrigin(request)).not.toThrow();
  });

  it("rejects a cross-origin request", () => {
    const request = new NextRequest("https://apollo.example/api/v1/test", { headers: { origin: "https://attacker.example" } });
    expect(() => requireSameOrigin(request)).toThrow(AuthorizationError);
  });

  it("rejects a different port", () => {
    const request = new NextRequest("http://localhost:3000/api/v1/auth/login", { headers: { origin: "http://127.0.0.1:3001" } });
    expect(() => requireSameOrigin(request)).toThrow(AuthorizationError);
  });

  it("rejects a malformed origin", () => {
    const request = new NextRequest("https://apollo.example/api/v1/test", { headers: { origin: "://bad-origin" } });
    expect(() => requireSameOrigin(request)).toThrow(AuthorizationError);
  });

  // Since the first Render deploy (2026-09-14) the expected origin is taken from the reverse proxy's X-Forwarded-Host /
  // X-Forwarded-Proto, because behind Render the app itself only sees plain http. A browser on another site cannot set
  // those headers, so what matters is that an Origin which does NOT match them is still rejected.
  it("rejects an origin that does not match the proxy's forwarded host", () => {
    const request = new NextRequest("http://localhost:10000/api/v1/test", {
      headers: {
        origin: "https://attacker.example",
        "x-forwarded-host": "apollo.example",
        "x-forwarded-proto": "https",
      },
    });
    expect(() => requireSameOrigin(request)).toThrow(AuthorizationError);
  });

  it("retains existing behavior when Origin is missing", () => {
    const request = new NextRequest("https://apollo.example/api/v1/test");
    expect(() => requireSameOrigin(request)).not.toThrow();
  });

  it("accepts a production-style same-origin request behind a TLS-terminating proxy", () => {
    const request = new NextRequest("http://localhost:10000/api/v1/auth/login", {
      headers: {
        origin: "https://apollo.example",
        host: "localhost:10000",
        "x-forwarded-host": "apollo.example",
        "x-forwarded-proto": "https",
      },
    });
    expect(() => requireSameOrigin(request)).not.toThrow();
  });
});

describe("origin used in emailed links", () => {
  const saved = { base: process.env.APP_BASE_URL, render: process.env.RENDER_EXTERNAL_URL };
  afterEach(() => {
    if (saved.base === undefined) delete process.env.APP_BASE_URL; else process.env.APP_BASE_URL = saved.base;
    if (saved.render === undefined) delete process.env.RENDER_EXTERNAL_URL; else process.env.RENDER_EXTERNAL_URL = saved.render;
  });

  it("ignores forged host headers when a base URL is configured", () => {
    process.env.APP_BASE_URL = "https://app.example.com/";
    const request = new NextRequest("https://app.example.com/api/v1/auth/forgot-password", { headers: { "x-forwarded-host": "attacker.example", "x-forwarded-proto": "https" } });
    expect(publicOriginForLinks(request)).toBe("https://app.example.com");
  });

  it("uses Render's own URL when no base URL is set", () => {
    delete process.env.APP_BASE_URL;
    process.env.RENDER_EXTERNAL_URL = "https://flo.onrender.com";
    const request = new NextRequest("https://flo.onrender.com/x", { headers: { "x-forwarded-host": "attacker.example" } });
    expect(publicOriginForLinks(request)).toBe("https://flo.onrender.com");
  });
});
