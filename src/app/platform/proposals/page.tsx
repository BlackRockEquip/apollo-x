import Link from "next/link";
import { Plus } from "lucide-react";
import { requireRequestContext } from "@/lib/auth/session";
import { PROPOSAL_STATUSES, PROPOSAL_STATUS_LABEL, type ProposalStatusValue } from "@/lib/proposals/model";
import { countProposalsByStatus, listProposals } from "@/lib/proposals/service";
import { ProposalsWorkspace } from "@/components/ProposalsWorkspace";

export const dynamic = "force-dynamic";

// 2026-10-21 — Platform > Proposals: Flo X's own quotations to prospective clients. Filter by status; "New proposal" opens the
// builder (a demo request's "Create proposal" button opens it with the client's details filled in).
export default async function PlatformProposalsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireRequestContext();
  const sp = await searchParams;
  const raw = typeof sp.status === "string" ? sp.status : "";
  const filter = (PROPOSAL_STATUSES as readonly string[]).includes(raw) ? (raw as ProposalStatusValue) : undefined;
  const [items, counts] = await Promise.all([listProposals(ctx, filter), countProposalsByStatus(ctx)]);
  const canEdit = ctx.platformPermissions.has("PLATFORM_SUPPORT_WRITE");
  const total = PROPOSAL_STATUSES.reduce((n, s) => n + counts[s], 0);
  return (
    <div>
      <header className="page-header compact">
        <div><p className="eyebrow">Platform</p><h1>Proposals</h1><p>Quotations Flo X sends to possible new clients. Prices come from the price list under Setup and can be changed on each proposal.</p></div>
        {canEdit ? <Link href="/platform/proposals/new" className="gold-button"><Plus size={14} /> New proposal</Link> : null}
      </header>
      <nav className="settings-nav">
        <Link href="/platform/proposals" className={!filter ? "quiet-button active" : "quiet-button"}>All ({total})</Link>
        {PROPOSAL_STATUSES.map((s) => <Link key={s} href={`/platform/proposals?status=${s}`} className={filter === s ? "quiet-button active" : "quiet-button"}>{PROPOSAL_STATUS_LABEL[s]} ({counts[s]})</Link>)}
      </nav>
      <ProposalsWorkspace key={filter ?? "ALL"} items={items} canEdit={canEdit} />
    </div>
  );
}
