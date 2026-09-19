import type { NextConfig } from "next";

// 2026-09-19 — user report: "deploy and push successful, still no logo
// showing... when uploading logo it shows broken icon" (following the
// Content-Disposition fix in company-settings-service.ts, which fixed
// direct navigation to the logo route but not the in-app <img> tags).
// Root cause, confirmed via the browser console: "Loading the image
// 'https://<account>.r2.cloudflarestorage.com/...' violates ... Content
// Security Policy directive: img-src 'self' data: blob:. The action has
// been blocked." Direct URL navigation isn't governed by img-src at all
// (only embedded-resource loads are), which is exactly why that test
// passed while every real <img>/<Image> use (sidebar, Company Settings
// preview, print letterheads, the favicon) kept showing a broken icon —
// this was never actually about Content-Disposition once the browser got
// as far as deciding whether to render it; CSP was refusing to even
// request the image. Wildcarded to the provider's own domain (rather than
// one company's specific account subdomain) so any company's own R2/B2
// account — including a future per-company Super Admin storage override,
// see getStorageBackendForCompany in src/lib/storage/index.ts — works
// without a further code change; STORAGE_S3_ENDPOINT (the platform
// default bucket) is added explicitly on top in case it's ever a
// non-R2/B2 S3-compatible host. A per-company override onto some other,
// unrelated S3-compatible host (StorageProviderType.S3_COMPATIBLE) would
// need its own origin added here — not exercised by any company today.
const storageEndpointOrigin = (() => {
  const endpoint = process.env.STORAGE_S3_ENDPOINT;
  if (!endpoint) return null;
  try {
    return new URL(endpoint).origin;
  } catch {
    return null;
  }
})();
const imgSrc = [
  "'self'",
  "data:",
  "blob:",
  "https://*.r2.cloudflarestorage.com",
  "https://*.backblazeb2.com",
  ...(storageEndpointOrigin ? [storageEndpointOrigin] : []),
].join(" ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // 2026-09-14 — dev-only setting (has no effect on `next build`/`next
  // start`): Next.js 15.3+ blocks cross-origin requests to dev-server
  // assets by default, so a teammate opening the app from their own
  // machine on the workshop LAN (e.g. http://192.168.101.x:3000 while
  // running `next dev`) got a 500 on every page — first surfaced as
  // "Blocked cross-origin request... from 192.168.101.110". The `*`
  // wildcard matches exactly one dot-separated label, which for an IPv4
  // address means one octet, so "192.168.101.*" allows any device on this
  // same /24 segment. If people also connect from a different subnet
  // (different office/VPN range), add another entry for it the same way.
  allowedDevOrigins: ["192.168.101.*"],
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Content-Security-Policy",
            value: `default-src 'self'; img-src ${imgSrc}; font-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
