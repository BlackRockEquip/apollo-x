import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { requireSameOrigin } from "@/lib/security/request";
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

  it("does not allow spoofed forwarded headers to bypass a different origin", () => {
    const request = new NextRequest("https://apollo.example/api/v1/test", {
      headers: {
        origin: "https://attacker.example",
        host: "apollo.example",
        "x-forwarded-host": "attacker.example",
        "x-forwarded-proto": "https",
      },
    });
    expect(() => requireSameOrigin(request)).toThrow(AuthorizationError);
  });

  it("retains existing behavior when Origin is missing", () => {
    const request = new NextRequest("https://apollo.example/api/v1/test");
    expect(() => requireSameOrigin(request)).not.toThrow();
  });

  it("accepts a production-style same-origin request", () => {
    const request = new NextRequest("https://apollo.example/api/v1/auth/login", {
      headers: {
        origin: "https://apollo.example",
        host: "apollo.example",
        "x-forwarded-host": "evil.example",
        "x-forwarded-proto": "http",
      },
    });
    expect(() => requireSameOrigin(request)).not.toThrow();
  });
});
