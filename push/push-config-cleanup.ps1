cd "C:\Projects\Apollo X Working"
# Config clean-up: bootstrap platform credentials are no longer a standing environment setting. No code or database change.
git add -A
@'
Config clean-up: bootstrap platform credentials only needed for the first seed

- render.yaml no longer asks for BOOTSTRAP_PLATFORM_EMAIL / BOOTSTRAP_PLATFORM_PASSWORD (the build never runs the seed, and the platform administrator lives in the database).
- .env.example: the two lines are commented out with a note that they are only for the first seed of an empty database.
- README setup step updated to match.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
