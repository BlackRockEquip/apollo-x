cd "C:\Projects\Apollo X Working"
git add -A
@"
RFQ attachment stays, add-parts auto-closes, superseded numbers on pick slips + rules, delivery note changes

User requests:
1. RFQ: the attachment no longer has to be re-uploaded for every supplier. It stays
   (shown as a chip with a Remove button) after a request is sent, on the job RFQ
   popup and on Suppliers > RFQs.
2. Add parts: the Add parts section closes automatically after Add/Import parts
   succeeds (stays open on an error so nothing is lost).
3. Picking slips: new "Superseded no." column next to Part number (created slip,
   Stock Levels slip table/print, job slip print and saved PDF, slip list). Looked up
   from the part's SUPERSEDED alternate numbers, so numbers added later show on old slips.
4. Superseded numbers: adding a part's old number as superseded no longer fails with
   "already in use" when that number belongs to a deleted (inactive) part or to
   another part still in stock. Still refused: the part's own number, and a number
   already recorded as an alternate (the unique rule in the database).
5. Outwork delivery note: Make, Model and Serial (prefilled from the job, editable) above
   the Description table, on screen, print and saved PDF.
6. Print Delivery Note: opens an editor first - add/remove line items and notes - then
   prints; the same items/notes go into the saved PDF.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
"@ | Set-Content -Encoding utf8 commit-msg.txt
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
