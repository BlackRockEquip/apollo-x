cd "C:\Projects\Apollo X Working"
# Powered by footer on printed pages: the reserved-space wrapper no longer picks up each document's own table styles.
# No database change.
# Close the project files in your editor before running (and do not "Save All" in the editor first).
git add -A
@'
Fix: Powered by footer missing from printed pages

- The wrapper that reserves room for the footer was a table, so each print window's own table / cell styles (font size, text alignment, page-break-inside: avoid, borders) applied to it. It now resets itself completely (all: unset), so documents cannot change it and it cannot change them.
- Tested with headless Chrome prints: one footer per printed page for short and long documents, forced page breaks, and a document with hostile table styles.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
