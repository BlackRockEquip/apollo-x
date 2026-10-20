import { requireRequestContext } from "@/lib/auth/session";
import { getNewProposalSeed } from "@/lib/proposals/service";
import { ProposalBuilder } from "@/components/ProposalBuilder";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// 2026-10-21 — Platform > Proposals > New. `?demoRequestId=` (from a demo request's "Create proposal" button) pre-fills the client details
// and links the proposal to that request.
export default async function NewProposalPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireRequestContext();
  const sp = await searchParams;
  const demoId = typeof sp.demoRequestId === "string" && sp.demoRequestId ? sp.demoRequestId : null;
  const seed = await getNewProposalSeed(ctx, demoId);
  let demoLabel: string | null = null;
  if (seed.demoRequestId) {
    const demo = await prisma.demoRequest.findUnique({ where: { id: seed.demoRequestId }, select: { name: true, company: true } });
    demoLabel = demo ? (demo.company ? `${demo.name}, ${demo.company}` : demo.name) : null;
  }
  return <ProposalBuilder initial={seed.data} demoRequestId={seed.demoRequestId} demoLabel={demoLabel} canEdit={ctx.platformPermissions.has("PLATFORM_SUPPORT_WRITE")} />;
}
