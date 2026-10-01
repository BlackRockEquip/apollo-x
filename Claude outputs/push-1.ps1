cd "C:\Projects\Apollo X Working"
git add -A
@"
Add warranty status to job header, make outwork receive date editable

Job header: for Warranty-type jobs, the current warranty status
(Pending/Granted/Declined) now shows next to the job type line, as a
small colored pill (new WarrantyStatusPill in StatusPill.tsx - amber/
green/red). Reads the job's existing JobWarranty record directly, so
it reflects whatever was last saved from the Warranty panel further
down the page; no schema change, that model and its Save action
already existed.

Outwork: the edit-row form (supplier/description/qty/date sent out/
notes) now also has an editable "Received" date next to "Sent", in
the same table cell as the existing stacked Sent/Received display.
Previously the receive date could only be set (to today) or cleared
via the separate Mark received/Undo receive buttons - this lets it be
corrected directly, same as the sent date always could. Saving keeps
status in sync with the date the same way those two actions already
do: giving an item a receive date here marks it RECEIVED, clearing it
reverts to SENT_OUT, and touching other fields without changing the
receive date leaves status alone. dateReceived added to
outworkEditInput (src/lib/jobs/validation.ts) and threaded through in
editOutworkItem (src/lib/jobs/service.ts); the PATCH route itself
needed no change, it already forwards the whole request body through
to that function.

src/components/JobWorkspace.tsx, src/components/StatusPill.tsx,
src/lib/jobs/service.ts, src/lib/jobs/validation.ts,
src/app/globals.css.
"@ | Set-Content -Encoding utf8 commit-msg.txt
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
