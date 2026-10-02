cd "C:\Projects\Apollo X Working"
git add -A
@"
Fix parts-table supplier picker: commit on blur, close dropdowns on blur-away

Root cause of three related reports: the inline Supplier typeahead in the
job Parts table (and every other typeahead in this file - Machine make,
Customer, Apply job kit, bulk Supplier, RFQ supplier, Outwork supplier x2,
link an unlinked PEX return job) only ever saved/selected a value when its
dropdown button was explicitly clicked. Nothing closed the dropdown or
committed the typed text when focus moved elsewhere, so clicking straight
from one of these fields into another left the previous dropdown hanging
open, and typing a supplier's full name then clicking away (instead of
clicking the dropdown row) silently saved nothing - explaining both "the
dropdown does not go away" and "prefill does not pick up the supplier until
I press tab" (Tab happened to land focus on the matching dropdown button,
which is the only thing that actually worked).

Fix: new closeDropdownUnlessWithin() helper, attached as onBlur on each
dropdown's own wrapping <label>/<td> - closes it as soon as focus leaves
that wrapper (checked via relatedTarget), but not when focus moves to one of
the dropdown's own option buttons, so clicking an option still works exactly
as before. The parts-table Supplier cell additionally auto-commits on blur
when the typed text is an exact match for one of the currently loaded
supplier options, mirroring how the Order # cell beside it already commits
on blur.

This also resolves the "Parts follow-up section doesn't show a supplier
with no PO number yet" report - the backend (sendPartsFollowup,
partsFollowupGroups) already included PENDING lines with a supplier and no
order number; the supplier was just never actually being saved to the line
in the first place due to the picker bug above.

src/components/JobWorkspace.tsx.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
"@ | Set-Content -Encoding utf8 commit-msg.txt
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
