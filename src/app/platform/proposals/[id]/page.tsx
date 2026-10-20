import { notFound } from "next/navigation";
import { requireRequestContext } from "@/lib/auth/session";
import { getProposal } from "@/lib/proposals/service";
import { ProposalBuilder } from "@/components/ProposalBuilder";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// 2026-10-21 — Platform > Proposals > one proposal: edit, print, and move it between Draft / Sent / Accepted / Declined.
export default async function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireRequestContext();
  const { id } = await params;
  let proposal;
  try {
    proposal = await getProposal(ctx, id);
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") notFound();
    throw error;
  }
  let demoLabel: string | null = null;
  if (proposal.demoRequestId) {
    const demo = await prisma.demoRequest.findUnique({ where: { id: proposal.demoRequestId }, select: { name: true, company: true } });
    demoLabel = demo ? (demo.company ? `${demo.name}, ${demo.company}` : demo.name) : null;
  }
  return <ProposalBuilder key={proposal.id} initial={proposal.data} proposalId={proposal.id} status={proposal.status} demoRequestId={proposal.demoRequestId} demoLabel={demoLabel} canEdit={ctx.platformPermissions.has("PLATFORM_SUPPORT_WRITE")} />;
}
