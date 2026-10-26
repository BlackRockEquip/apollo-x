cd "C:\Projects\Apollo X Working"
# New Field service job: the Machine / component card is double width so the five machine fields are no longer squeezed.
# No database change.
# Close the project files in your editor before running (and do not "Save All" in the editor first).
git add -A
@'
New field service job: roomier Machine / component card

- On a new Field service job the Machine / component details card and Job details card are each half the screen width (Commercial & logistics sits below), so Machine make, model, serial, Plant number and Machine hours are no longer cramped.
- The machine rows now shrink to fewer columns when their own card is narrow (CSS container queries), also on the field job screen.
- Shorter placeholder in the Machine make box on the field layout.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
