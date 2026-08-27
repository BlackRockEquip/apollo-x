import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { requireSameOrigin } from "@/lib/security/request";
import { AuthorizationError } from "@/lib/auth/guards";

describe("same-origin mutation protection", () => {
  it("accepts a matching origin", () => {
    const request = new NextRequest("https://apollo.example/api/v1/test", { headers: { origin: "https://apollo.example" } });
    expect(() => requireSameOrigin(request)).not.toThrow();
  });

  it("rejects a cross-origin request", () => {
    const request = new NextRequest("https://apollo.example/api/v1/test", { headers: { origin: "https://attacker.example" } });
    expect(() => requireSameOrigin(request)).toThrow(AuthorizationError);
  });
});
