# Parts list: bulk "Send to Outwork" (2026-10-28)

User: "in job view, parts lists table, when clicking bulk update and selecting parts, add a button which is called 'send to Outwork' that adds the parts selected on an outwork sheet".

## What changed (`src/components/JobWorkspace.tsx` only)
- Bulk update bar: new "Send to Outwork (n)" button beside Mark received / Delete, enabled when at least one part is ticked. Shown only when `canSendToOutwork` (Outwork access FULL and not a view-only user), the same rule that unlocks the Outwork section.
- `sendSelectedPartsToOutwork()`: builds one outwork line per selected part - description "PartNo - description", quantity = the part line quantity (rounded, minimum 1, as outwork quantities are whole numbers) - then opens the existing Record outwork sheet (switches to the Outwork tab; on the tablet layout opens the Outwork sheet). Lines already typed on the sheet are kept; a part already listed is not duplicated.
- The user then picks the supplier and date sent out and records it as before (which also produces the outwork delivery note). On success the bulk selection is cleared and bulk mode closed.
- Parts keep their own status; sending to outwork does not change the part line.

## Deploy
`push\push-parts-bulk-send-to-outwork.ps1`, no migration, no API change.

## Notes
- Not tried in a browser. Open question if wanted: pre-pick the supplier when every selected part shares one (left off, since a part's supplier is who sells it, not necessarily who machines it).
