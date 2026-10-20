cd "C:\Projects\Apollo X Working"
# Platform > Proposals (quote builder) + editable price list in Platform Settings + "Create proposal" on demo requests.
# Needs a database change (new Proposal table + PlatformSettings.proposalPriceList column, migration 20261021120000_proposals);
# it applies by itself when Render deploys (prisma migrate deploy). For your local copy run once afterwards:
#   npx prisma migrate deploy   then   npx prisma generate
# Close the project files in your editor before running.
git add -A
@'
Platform proposals: quote builder, price list and demo-request link

- New Platform > Proposals screen: list with status filter (Draft / Sent / Accepted / Declined), change a status right in the table, open or delete a proposal.
- Proposal builder: client and quote details, products and modules with editable prices, platform fee / users / data import / training, discounts and VAT, introduction letter and terms. Live preview beside the form; Print / Save as PDF prints exactly what the preview shows. Save keeps the proposal; Mark as sent / accepted / declined from the proposal.
- Platform Settings > Proposal price list: edit products, modules, set-up fees, platform and user prices, VAT, validity, letter and terms (Restore sample prices button). New proposals start from it; each proposal keeps its own copy, so later price changes never alter an existing proposal.
- Demo Requests: "Create proposal" button on each request (table and view window) opens the builder with the client's details filled in and links the proposal to the request; the request shows its proposals.
- Quote numbers FX-Q-<year>-0001, 0002, ...; audit events for create / update / status / delete / price list.
- Database: Proposal table, ProposalStatus enum, PlatformSettings.proposalPriceList (migration 20261021120000_proposals).
- Tests: tests/unit/proposals.test.ts.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
