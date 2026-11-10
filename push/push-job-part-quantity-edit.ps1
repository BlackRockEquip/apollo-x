cd "C:\Projects\Apollo X Working"
# Job parts list: change the quantity of a part after it was added. No migration.
git add -A
@'
Job parts list: change the quantity of a part after it was added

- Qty column on the job's parts list: a pencil next to the quantity opens a box to type the right quantity (Enter or Save to keep it, Escape or Cancel to leave it). The tablet part sheet has a Quantity field at the top.
- New endpoint PATCH /api/v1/jobs/part-quantity { jobId, lineId, quantity } and updatePartLineQuantity in the jobs service.
- A part that is only waiting is checked against the shelf again for the new quantity (In stock or Pending), and the stock held back for the job is raised or lowered to match, so another job can or cannot take the difference.
- Safe limits: the quantity cannot go below what is already received, taken from stock or on a pick slip, or below the quantity marked as ordered from a supplier; a fully received part has to have its receive undone first. Each refusal says why in plain words.
- The change is written to the job's history ("quantity changed from 5 to 3") and the audit log.
- Tests for the quantity input rules.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
