cd "C:\Projects\Apollo X Working"
# Platform proposals: first-12-months total removed; printed sections kept whole per page; Initials box on every page.
# No database change.
# Close the project files in your editor before running.
git add -A
@'
Proposals: remove first 12 months total; print sections stay whole; initials box on every page

- The "First 12 months" total is removed from the proposal (totals box, builder summary and copied summary). The box now shows Once-off and Per month only.
- Printing: each section (header and addresses, letter, each product's scope table, included list, once-off fees, monthly fees with totals, terms, acceptance) is kept together and moves to the next page rather than being cut in half. A table longer than a page still continues on the next page with its headings repeated.
- Printing: an "Initials" box sits at the bottom right of every page, and the text never runs under it.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
