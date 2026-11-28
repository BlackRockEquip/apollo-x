import { requireRequestContext } from "@/lib/auth/session";
import { requireTenantModulePage, requireTenantPageAccess } from "@/lib/auth/page-guard";
import { CertificateView } from "@/components/tech-training/CertificateView";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ certNo: string }> }) {
  const { certNo } = await params;
  const ctx = await requireRequestContext();
  requireTenantModulePage(ctx, "TECH_TRAINING");
  requireTenantPageAccess(ctx, "TRAINING_VIEW");
  return <CertificateView certNo={decodeURIComponent(certNo)} />;
}
