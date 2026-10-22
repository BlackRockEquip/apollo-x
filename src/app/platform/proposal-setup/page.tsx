import { requireRequestContext } from "@/lib/auth/session";
import { ProposalPriceListEditor } from "@/components/ProposalPriceListEditor";

export const dynamic = "force-dynamic";

// 2026-10-22, user request: "move the proposal setup defaults [from Platform Settings] to a sidebar tab below proposals called Setup".
// The standing prices, fees, wording and products every new proposal starts from (Platform > Proposals). Editing needs the platform
// configuration permission; anyone who can write proposals can view it.
export default async function PlatformProposalSetupPage() {
  const ctx = await requireRequestContext();
  const canEdit = ctx.platformPermissions.has("PLATFORM_CONFIGURATION_MANAGE");
  return (
    <div>
      <header className="page-header compact">
        <div><p className="eyebrow">Platform &gt; Proposals</p><h1>Proposal Setup</h1><p>The prices, fees, wording and products every new proposal starts from. Each proposal keeps its own copy, so changing this never alters proposals you have already made.</p></div>
      </header>
      <ProposalPriceListEditor canEdit={canEdit} />
    </div>
  );
}
