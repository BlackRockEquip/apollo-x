cd "C:\Projects\Apollo X Working"
# Settings > Company / Branding: document header + footer text now print, with a live preview next to each box. No migration.
git add -A
@'
Document header and footer text now print, with a live preview in Settings

Settings > Company / Branding: "Document header text" and "Document footer text" were saved but never printed. The header now prints at the very top of every page, above the logo and company details; the footer prints at the bottom of every page, above the page number and the "Powered by" lines. Both apply to every print window (delivery notes, job card, job history, pick slips, parts list, reports, table prints, stock levels, dimension reports) and every server-made PDF (saved job documents, emailed WIP list, blank delivery note). Line breaks are kept; empty boxes print nothing. Switching off "Powered by" does not hide them.

Preview: next to each box a sample delivery note shows the wording where it will print (top of the page for the header, bottom for the footer), updating as you type, using your logo and company details; "Whole page" opens the full sheet. The preview uses the same styling code as the printed documents (src/lib/documents/doc-text.ts).

Print windows read the wording from the signed-in page (PoweredByFlag), so saving in Settings applies at once. Sheet-style documents (Job Card, Job History) get the header inside each sheet and extra room above the footer.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
