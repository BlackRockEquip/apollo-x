cd "C:\Projects\Apollo X Working"
# Job > Parts list > Print Parts List: choose Complete or Outstanding, then Print / PDF or Excel. No database change.
# Close the project files in your editor before running.
git add -A
@'
Jobs: Print Parts List can print the complete list or only outstanding parts (PDF or Excel)

- The Print Parts List button now opens a small window: Complete parts list or Outstanding parts only (not yet fully received, with line counts), then Print / save PDF or Download Excel.
- Outstanding = quantity minus received is above zero. The printed list and saved PDF are titled "(outstanding parts)" and saved with "- Outstanding" in the file name.
- Excel file has Part number, Description, Qty, Received, Outstanding, Order number, Supplier, Status, Notes.
- If nothing is outstanding the window says so and the buttons are off.
- Tests: tests/unit/parts-list-scope.test.ts.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
