import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Apollo X", template: "%s | Apollo X" },
  description: "Apollo X operational and commercial platform",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
