cd "C:\Projects\Apollo X Working"
# Advertising: headline and button text optional, picture-only ads, picture scaled to fit.
# No database change.
# Close the project files in your editor before running.
git add -A
@'
Advertising: headline/button optional, picture-only ads, picture auto-fits

- Platform > Advertising: headline, one-line text and button text are now optional (only the advertiser name and link are needed).
- An ad with a picture and no headline/text/button shows just the picture in the sidebar, the whole picture being the link.
- Pictures are shown whole (no cropping), scaled to the sidebar width, any shape; with text the picture sits on top at its natural shape.
- Tests: picture-only ad validation.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
