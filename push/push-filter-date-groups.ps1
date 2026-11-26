cd "C:\Projects\Apollo X Working"
# Column filters: dates grouped by year > month > day, like Excel. No migration.
git add -A
@'
Column filters: dates grouped by year, month and day, like Excel

User: "on job wip table, when selecting fields on the filter, can they not be grouped like in an excel filter eg: grouped by
year, month etc". In the column filter (TableColumnFilters, used on Jobs & WIP and the other tables under Jobs), a column whose
values are dates (Date in, Invoice date, Delivery date ...) lists them as a tree: Year > Month > Day, each level with a tick box
(ticked / unticked / part-ticked) and row count. Ticking a year or month ticks every date in it. Blanks and other text are listed
under the tree. With one year only it starts open; a search opens what matches. Stored filters are unchanged.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Uze9oWQMSgA2rwfJEsDMsg
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
