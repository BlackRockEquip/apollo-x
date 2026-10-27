import "./platform-theme.css";
import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth/session";
import { PlatformShell } from "@/components/PlatformShell";
import { newDemoRequestCountSafe } from "@/lib/platform/demo-requests-service";

export const dynamic = "force-dynamic";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const context = await getRequestContext();
  if (!context) redirect("/login");
  if (context.companyId) redirect("/dashboard");
  const demoNewCount = await newDemoRequestCountSafe(context);
  return <PlatformShell context={context} demoNewCount={demoNewCount} title="Platform Admin" subtitle="Company management, licensing, platform authority and audited support access.">{children}</PlatformShell>;
}