import { requireRequestContext } from "@/lib/auth/session";
import { requireTenantModulePage, requireTenantPageAccess } from "@/lib/auth/page-guard";
import { LearnerHome } from "@/components/tech-training/LearnerHome";

export const dynamic = "force-dynamic";

// 2026-11-28: Tech Training home - the learner's courses.
export default async function Page() {
  const ctx = await requireRequestContext();
  requireTenantModulePage(ctx, "TECH_TRAINING");
  requireTenantPageAccess(ctx, "TRAINING_VIEW");
  return <LearnerHome />;
}
