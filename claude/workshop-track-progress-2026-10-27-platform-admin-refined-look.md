# Platform admin refined look (2026-10-27)

User: "the look has not changed on the platform admin side" - the earlier push only carried the three features (broadcasts, users grouped by company, ad preview), not the visual redesign from the Design mockup. This change applies the look.

## What changed
- `src/app/platform/platform-theme.css` (new): everything scoped to `.platform-shell`, so the company side is untouched. 248px navy sidebar with gold brand mark, section labels, gold-tinted active item with a 3px gold bar, gold count badge, user card at the foot. Frosted 60px top bar, 28/32px page padding, gold eyebrow and 26px page titles, refined cards/panels/toolbars/tables (uppercase headers, gold row hover), pills with a leading dot, gold/primary/quiet buttons, gold focus ring on inputs, segmented tab strips, rounded notices, mobile layout under 960px.
- `src/components/PlatformShell.tsx`: nav split into Operate (Overview, Companies, Platform Users), Support and sales (Support, Demo Requests, Proposals, Proposal setup), Platform (Broadcasts, Advertising, Platform Settings). Top bar shows "Platform Admin / <current page>" with the subtitle as tooltip. Display name moved to the sidebar user card.
- `src/app/platform/layout.tsx`: imports the stylesheet.

## Deploy
`push\push-platform-admin-refined-look.ps1` - no migration. Also re-run `push\push-platform-broadcasts-users-ad-preview.ps1` first if git said "nothing to commit" earlier: the groupBy build fix (broadcasts-service.ts) is on the device now.

## Notes
- Not rendered in a browser in this session; pages keep their own markup and just pick up the scoped styles, so tweak spacing in platform-theme.css if a screen looks off.
