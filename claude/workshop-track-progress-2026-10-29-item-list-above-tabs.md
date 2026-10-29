# Workshop Track progress — 2026-10-29 — Item list above the item header and tabs

**Report (screenshot):** the "All items" card is in the wrong spot. Cause: the item list (`JobItemsPanel`) was rendered inside `jobFormSections` (Details tab, under Customer details) while the item header card above the tabs says "Select one in the list above". On any other tab there was no way to pick an item.

**Now (as in the mockup):** stepper -> facts strip -> **item list** -> item header card -> tabs.
- `JobWorkspace.tsx`: `{!tabletLayout && itemsPanelSection}` after `JobFactsStrip`; in the Details tab the old spot is an empty `display: contents` slot (`selectedItemSlot`).
- `JobItemsPanel.tsx`: new `selectedSlot` prop; the selected item's detail card is drawn into that slot with a portal, so it still shows in the Details tab (edit state stays shared with the list). New "Hide list / Show list" toggle (open by default, not remembered). One-item jobs unchanged.
- `globals.css`: `.ji-fold`, spacing.

Checked: no new tsc errors (29 baseline in these files, same before and after); rendered the panel with a stand-in page in Chrome: list on top, detail card portals into the Details slot, fold works. Not run in the real app.
No migration. Push: `push\push-item-list-above-tabs.ps1`.
