import type { NextConfig } from "next";

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
            value: `default-src 'self'; img-src 'self' data: blob:; font-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
