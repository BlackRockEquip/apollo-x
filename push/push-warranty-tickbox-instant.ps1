cd "C:\Projects\Apollo X Working"
# Fix: the Is warranty tickbox only took effect after leaving the job. No migration.
git add -A
@'
Is warranty tickbox now takes effect as it is clicked

- Ticking or unticking Is warranty was not part of the job autosave, so it was only saved when the person left the job. It now saves like every other field, about a second after the click.
- The Warranty tab and the Warranty pill in the header follow the tickbox straight away instead of waiting for the save to come back.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
