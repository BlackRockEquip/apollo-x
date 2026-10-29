cd "C:\Projects\Apollo X Working"
# Engineering: delivery notes per item (partial deliveries). No migration.
git add -A
@'
Engineering: delivery note per item (partial deliveries)

On a multi-item job the Delivery note window now starts with "Items on this delivery": every item on the job with a tick box, its tag and status. The items that are ready to deliver are ticked; each ticked item becomes a line (tag, component, model, serial, machine) that can still be edited, and typed lines can be added as before. The note gets its own delivery date (today), editable, instead of the job's single delivery date.

Printing the note offers to save it as a PDF named after its items ("... - Delivery note - Items 1, 3") so one delivery never replaces another. Afterwards, if left ticked, the ready items on the note move to Delivered / Await payment (with the usual "all documents uploaded?" check for Engineering), so the next note starts from the items still waiting. The job goes to Delivered / Await payment when the last item has gone out. Items that were ticked but not ready stay where they are.

The item list on the job screen gets a Delivery note button, and moving an item to ready to deliver or later from its status box now asks the same documents question the job stepper asks.

Jobs with no items behave exactly as before. No migration. Rules (line wording, default ticks, which items move, file name) are in src/lib/jobs/item-model.ts (tested).

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
