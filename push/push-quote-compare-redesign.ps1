cd "C:\Projects\Apollo X Working"
# Compare quotes redesign (supplier entry screen + Compare Prices decision screen). No migration.
git add -A
@'
Redesign Compare quotes: supplier entry screen and Compare Prices decision screen

- Compare quotes now shows the suppliers down the left (status, how many lines answered, total, how many lines they are lowest on) and one supplier's prices at a time on the right. Each price shows how it compares with the other suppliers: Lowest of all, or +x% with who is lowest. Enter in a price box jumps to the next line.
- Import quote file, View quote file, notes, N/A (with Undo) and Save this supplier work as before. Done saves every supplier still marked Unsaved. A supplier that already has a quote file still asks before it is replaced.
- Best mix card: what the job costs if every line is bought from whoever is cheapest.
- Compare Prices (was Saved quotes) is now a decision view: click a price to choose it for that line, Choose all for a whole supplier, or Choose lowest on every line. Lowest prices are marked, prices far below the others are marked Check, and +x% shows how much more than the lowest.
- Side panel shows the selection total, the saving against the one supplier that priced every line, the split by supplier, and parts worth a second look (single quote, suspiciously low price). Set preferred suppliers saves the choices exactly as OK did.
- Nothing is chosen for you; choices stay staged until Set preferred suppliers. CSV and Excel downloads are unchanged.
- New files in src/components/quote-compare; styles appended to globals.css (qc- classes, older quote rules untouched).

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
