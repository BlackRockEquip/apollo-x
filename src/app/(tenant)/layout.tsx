import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getRequestContext } from "@/lib/auth/session";
import { AppShell } from "@/components/AppShell";

export const dynamic = "force-dynamic";

export default async function TenantLayout({ children }: { children: React.ReactNode }) {
  const context = await getRequestContext();
  if (!context) redirect("/login");
  if (!context.companyId) redirect("/platform");
  const company = await prisma.company.findUnique({ where: { id: context.companyId }, select: { legalName: true, tradingName: true } });
  if (!company) redirect("/login");
  return <AppShell context={context} companyName={company.tradingName ?? company.legalName}>{children}</AppShell>;
}
