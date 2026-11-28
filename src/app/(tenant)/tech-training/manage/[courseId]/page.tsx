import { requireRequestContext } from "@/lib/auth/session";
import { requireTenantModulePage, requireTenantPageAccess } from "@/lib/auth/page-guard";
import { CourseEditor } from "@/components/tech-training/CourseEditor";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const ctx = await requireRequestContext();
  requireTenantModulePage(ctx, "TECH_TRAINING");
  requireTenantPageAccess(ctx, "TRAINING_CONTENT_EDIT");
  return <CourseEditor courseId={courseId} />;
}
