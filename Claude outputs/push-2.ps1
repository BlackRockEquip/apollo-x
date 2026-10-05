cd "C:\Projects\Apollo X Working"
git add -A
@"
Job parts: Order # box now follows the stored value after a bulk update

User report: after a bulk update on a job's parts (adding a supplier),
the supplier couldn't be edited again.

The server has no lock on a line's supplier, so this was a page problem.
The Order # box in the parts table is uncontrolled and was keyed only by
the line id, so a value changed from outside it (the bulk update's order
number) never showed up: it kept displaying the old blank text while the
line really had an order number. The first blur out of it then looked like
an edit, saved a blank order number over the bulk-applied one, and put the
table into its saving state, which disables the Supplier inputs right as
the user clicked across to them.

Fix: key the input on the stored order number so it remounts whenever the
server value changes, so what it shows and compares against on blur is
always current.

Changed: src/components/JobWorkspace.tsx.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
"@ | Set-Content -Encoding utf8 commit-msg.txt
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
