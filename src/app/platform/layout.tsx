import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth/session";
import { PlatformShell } from "@/components/PlatformShell";

export const dynamic = "force-dynamic";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const context = await getRequestContext();
  if (!context) redirect("/login");
  if (context.companyId) redirect("/dashboard");
  return <PlatformShell context={context} title="Platform Admin" subtitle="Company management, licensing, platform authority and audited support access.">{children}</PlatformShell>;
}