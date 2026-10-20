import { describe, expect, it } from "vitest";
import { normalizeWebsiteUrl } from "@/lib/master-data/website-url";

describe("normalizeWebsiteUrl", () => {
  it("adds https to a bare address", () => {
    expect(normalizeWebsiteUrl("www.acme.co.za")).toBe("https://www.acme.co.za/");
    expect(normalizeWebsiteUrl("  acme.co.za/about ")).toBe("https://acme.co.za/about");
  });
  it("keeps http and https addresses", () => {
    expect(normalizeWebsiteUrl("http://acme.co.za")).toBe("http://acme.co.za/");
    expect(normalizeWebsiteUrl("https://acme.co.za/x?y=1")).toBe("https://acme.co.za/x?y=1");
  });
  it("returns null for blanks, junk and unsafe schemes", () => {
    for (const bad of ["", "   ", null, undefined, "javascript:alert(1)", "ftp://acme.co.za", "not a url", "localhost", "data:text/html,hi"]) {
      expect(normalizeWebsiteUrl(bad as string | null | undefined)).toBeNull();
    }
  });
});
