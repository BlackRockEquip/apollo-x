import { notFound } from "next/navigation";
import { ModuleKey } from "@prisma/client";
import { requireRequestContext } from "@/lib/auth/session";
import { requireModule } from "@/lib/auth/guards";
import { MODULE_LABELS } from "@/lib/constants";

const ROUTE_MODULE: Record<string, ModuleKey> = {
  customers: "CUSTOMERS", suppliers: "SUPPLIERS", jobs: "JOBS_WIP", inventory: "INVENTORY",
  "pex-stock": "PEX_STOCK", "pex-tracking": "PEX_TRACKING", quotes: "QUOTES",
  "sales-orders": "SALES_ORDERS", invoices: "INVOICES", reports: "REPORTS", settings: "DASHBOARD",
};

export default async function ModulePlaceholder({ params }: { params: Promise<{ module: string }> }) {
  const route = (await params).module;
  const moduleKey = ROUTE_MODULE[route];
  if (!moduleKey) notFound();
  const context = await requireRequestContext();
  requireModule(context, moduleKey, "READ");
  return <div><div className="page-header"><div><p className="eyebrow">Approved roadmap</p><h1>{MODULE_LABELS[moduleKey]}</h1><p>This module boundary is entitlement-protected. Its combined reference implementation will be delivered in its approved phase.</p></div></div><section className="foundation-panel"><div><h2>Foundation connected</h2><p>Tenant, entitlement and support-context enforcement is active before module data is introduced.</p></div><span className="status-pill neutral">Planned</span></section></div>;
}
