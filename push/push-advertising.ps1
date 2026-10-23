cd "C:\Projects\Apollo X Working"
# Platform > Advertising + the ad block above Reports in every company's sidebar.
# ONE database change: migration 20261023120000_advertising (Advertisement table, CompanySettings.hideAds). Render applies it on deploy.
# Close the project files in your editor before running.
git add -A
@'
Platform Advertising: timeslot ads in the company sidebar, Flo X card when nothing is live

- Platform > Advertising (new menu): create ads (advertiser, link, headline, button text, one line of text, picture), pause/resume, delete.
- Up to 10 timeslots per ad (days of week, from/to time, date range; South African time). Live while any slot is live; overlapping ads rotate.
- Show to all companies or only selected companies. Views and clicks are counted (only for ads that are really live for that company).
- Company sidebar: ad block above Reports. No ad live = Flo X card with "Talk to us". Hidden in platform support sessions.
- Platform > Companies > company: tick box to hide the advertising block for that company.
- Pictures: PNG/JPG/WebP under 400 KB, stored in the database; links must be http(s).
- Migration 20261023120000_advertising. Tests: timeslot maths, targeting, validation, hidden cases, permissions.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
