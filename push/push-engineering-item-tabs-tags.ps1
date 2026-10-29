cd "C:\Projects\Apollo X Working"
# Engineering: item tabs like the mockup, job tags printing, report counts, tablet item tags, job card with every item. No migration.
git add -A
@'
Engineering: item tabs, job tags, report counts, tablet tags and a job card with every item

Tabs: the job's tab strip now sits under an item header card (tag, component, Change status) like the item mockup. Tabs are Details, Parts, Outwork, Specifications, Photos & files and Activity (plus Pick slips, Follow-up, PEX and Warranty when they apply) with count pills that follow the selected item. The Activity tab reads like the mockup (Today 09:12 / 29 Oct in a left column) and follows the selected item. Selecting nothing shows "All items".

Print job tags: new "Print tags" button on the item list (and Job tags in the Print menu) opens a window to pick the items, copies of each tag and the label size (100 x 50, 76 x 51, 100 x 150 mm), with a live preview. Each tag has the item tag in large type, component, model / serial / part number, machine and plant, customer, received date and a Code 128 barcode of the tag. The printer choice is a driver list (src/lib/printing/label-printers.ts): today the browser print dialog sized to the label; a thermal printer driver (ZPL / ESC-POS, QZ Tray, Zebra Browser Print) can be added there without changing the screens. Size and printer are remembered on that computer. Works for an ordinary one-item job too.

Item list summary now includes specification report counts ("2 parts, 1 outwork, 1 report").

Mechanic tablet part cards show the item tag of the part.

The printed job card and its saved PDF list every item (tag, component, model / serial / part no., machine, work requested) on a multi-item job instead of item 1 only. One-item jobs are unchanged.

Parts added by job kits, Stock Levels pick slips and mechanic pick slip requests still land on the whole job (move them with the item picker). RFQ, Compare quotes and parts follow-up emails stay per job.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
