cd "C:\Projects\Apollo X Working"
git add -A
@"
Job parts: clearing the supplier name now removes the supplier

User report: "trying to remove a supplier name on parts list table still not
working."

The Supplier cell on the parts table is a typeahead. Emptying it and clicking
away only closed the picker (it saved only when the typed text matched a real
supplier), so the stored supplier was never cleared and the old name came back.

Fix: leaving the box empty on a line that has a supplier now clears it, and a
small x button next to the name removes it in one click. Clearing the supplier
and order number on a line also clears its ordered quantity (server side).

Changed: src/components/JobWorkspace.tsx.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
"@ | Set-Content -Encoding utf8 commit-msg.txt
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
