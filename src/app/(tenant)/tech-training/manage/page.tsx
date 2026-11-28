import { requireRequestContext } from "@/lib/auth/session";
import { requireTenantModulePage, requireTenantPageAccess } from "@/lib/auth/page-guard";
import { CourseManager } from "@/components/tech-training/CourseManager";

export const dynamic = "force-dynamic";

export default async function Page() {
  const ctx = await requireRequestContext();
  requireTenantModulePage(ctx, "TECH_TRAINING");
  requireTenantPageAccess(ctx, "TRAINING_CONTENT_EDIT");
  return <CourseManager />;
}
