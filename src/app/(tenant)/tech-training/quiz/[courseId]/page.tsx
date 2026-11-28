import { requireRequestContext } from "@/lib/auth/session";
import { requireTenantModulePage, requireTenantPageAccess } from "@/lib/auth/page-guard";
import { QuizRunner } from "@/components/tech-training/QuizRunner";

export const dynamic = "force-dynamic";

export default async function Page({ params, searchParams }: { params: Promise<{ courseId: string }>; searchParams: Promise<{ kind?: string; chapter?: string }> }) {
  const { courseId } = await params;
  const sp = await searchParams;
  const kind = sp.kind === "PRE" || sp.kind === "CHECK" ? sp.kind : "FINAL";
  const ctx = await requireRequestContext();
  requireTenantModulePage(ctx, "TECH_TRAINING");
  requireTenantPageAccess(ctx, "TRAINING_VIEW");
  return <QuizRunner courseId={courseId} kind={kind} chapterKey={sp.chapter ?? ""} />;
}
