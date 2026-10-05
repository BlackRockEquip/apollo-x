cd "C:\Projects\Apollo X Working"
git add -A
@"
Job parts: supplier dropdown on the parts table was clipped by the table's scroll box

User reports Mark received / Undo receive now work, but typing into a blank
supplier field (or after removing a supplier) shows no supplier suggestions:
"Is the dropdown not hidden behind a field?"

Cause: the parts table sits inside .data-table-wrap (overflow:auto, max-height),
which clips anything absolutely positioned that extends past it. The suggestion
list rendered inside the supplier cell but was cut off, so nothing was visible
(Tab still picked the first match because the buttons existed in the DOM).

Fix (JobWorkspace.tsx): the suggestion list is now position:fixed at the supplier
input's on-screen rectangle, re-measured on scroll/resize, and flips above the
input when there is little room below. A fixed element cannot be clipped by an
overflow:auto ancestor, and it is still inside the cell so the existing blur
handling is unchanged.

Changed: src/components/JobWorkspace.tsx.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
"@ | Set-Content -Encoding utf8 commit-msg.txt
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
