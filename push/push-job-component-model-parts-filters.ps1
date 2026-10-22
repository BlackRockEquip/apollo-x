cd "C:\Projects\Apollo X Working"
# Job page: Machine / component details card reordered + Component model; Parts list headers filterable.
# Includes ONE database migration (adds Job.componentModel) - Render applies it on deploy (prisma migrate deploy).
# Close the project files in your editor before running.
git add -A
@'
Job page: Machine / component details reordered with Component model; Parts list column filters

- New "Component model" field on the job's Machine / component details card (new Job.componentModel column, migration 20261022120000). It is saved with the job, searched by the Jobs search, shown on the printed Job Card / Job History / saved PDFs, and available in the Jobs import / export.
- The card is laid out two to a row: Machine make; Machine model + Machine serial; Component model + Component; Component serial + Part number; Plant number + Machine hours.
- Machine make: a make that is not in the manufacturers list is added to it - when a new job is created, or on an existing job when you leave the field (it autosaves while you type, so it is not added on every pause). A hint under the field says when it will be added.
- The Parts list table headers now have the same Excel-style filters as the other tables (Part, Qty, Order, Supplier, Status, Notes), kept per job. Bulk update only ever selects the rows that are visible.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
