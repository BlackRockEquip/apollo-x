import { requireRequestContext } from "@/lib/auth/session";
import { requireTenantModulePage, requireTenantPageAccess } from "@/lib/auth/page-guard";
import { LessonReader } from "@/components/tech-training/LessonReader";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ courseId: string; lessonKey: string }> }) {
  const { courseId, lessonKey } = await params;
  const ctx = await requireRequestContext();
  requireTenantModulePage(ctx, "TECH_TRAINING");
  requireTenantPageAccess(ctx, "TRAINING_VIEW");
  return <LessonReader key={`${courseId}-${lessonKey}`} courseId={courseId} lessonKey={decodeURIComponent(lessonKey)} />;
}
