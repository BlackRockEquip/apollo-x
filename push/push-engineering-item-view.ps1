cd "C:\Projects\Apollo X Working"
# Engineering: the job screen shows "Where the items are", and a one-item job gets the same item view. No migration, no new tables.
git add -A
@'
Engineering: item view and "Where the items are" stepper on the job screen

The status stepper in the job header now works like the item mockup. One circle per step shows how many items are on it; steps before the least advanced item turn green. Clicking a step moves the item that is selected on the job (the step it is on is ringed). With no item selected on a job with several items, clicking a step asks first and then moves every item. The "To be delivered" and later documents check still applies.

The item list is now the way to pick an item. Click a row (or its component name) to select it: the Parts, Outwork, Photos, Files, Specifications and Activity tabs show only that item's records (plus job-wide ones), a selected-item card shows its model, serial, part number, machine, plant, hours, work requested and condition, and "Show all items" goes back to the whole job. The old strip of count pills inside the list is gone because the header stepper replaces it.

An ordinary one-item Engineering job now shows the same item list with its single item (tag, component, machine, status, ETA) and the same stepper, with the Machine / component card still under it for editing. The "Add item" button on that list turns the job into a multi-item job exactly as before, replacing the separate "Add another item" card.

Activity history entries about one item are tagged with it (already stored), so the Activity tab can follow the selected item.

The Delivery note window's line table (description / qty) was squashed to a sliver that scrolled inside itself; the rows now show in full and the window scrolls instead (same fix covers the outwork delivery note window).

No database changes: nothing to migrate.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
