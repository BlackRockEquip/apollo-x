import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Apollo X", template: "%s | Apollo X" },
  description: "Apollo X operational and commercial platform",
};

// 2026-09-14 — explicit viewport meta, added as part of the mobile/phone
// pass ("Let other users be able to connect on cellphones, laptops etc" ->
// clarified to "make sure the UI works well on phones"). Without this,
// mobile browsers render the page at desktop width and let the user pinch-
// zoom instead of laying out at the phone's actual width, which would make
// every @media (max-width: ...) rule below moot — a phone's viewport would
// never actually measure as narrow.
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
