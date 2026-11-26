cd "C:\Projects\Apollo X Working"
# Failure Reports: say so when the session has run out, instead of "uploading" and then nothing. No migration.
git add -A
@'
Failure Reports: show "signed out" instead of failing quietly when adding photos

Live report: "trying to add photos on the live system and it says uploading but then nothing happens". The session had run out
while the report was open; the sign-in check sends every signed-out request to /login, the browser followed it silently and the
screen never knew. Now a signed-out answer (or any non-JSON answer) is an error the screen shows, and photo messages show next to
the drop zone (the message bar at the top was out of view). Adding stops at the first such error instead of trying every photo.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Uze9oWQMSgA2rwfJEsDMsg
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
