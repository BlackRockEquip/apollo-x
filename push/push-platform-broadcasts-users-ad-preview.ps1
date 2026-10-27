cd "C:\Projects\Apollo X Working"
# Platform admin: Broadcasts (new), Platform Users grouped by company, Advertising preview of saved ads.
# HAS A MIGRATION (prisma/migrations/20261027140000_platform_broadcasts): Render applies it on deploy. It sorts after
# 20261027130000_rfq_quote_line_lead_time, so if that earlier push has not gone out yet, this one carries it as well.
git add -A
@'
Platform admin: Broadcasts, Platform Users grouped by company, Advertising preview

Broadcasts (Platform > Broadcasts, new): send a message that pops up inside the app to all companies, chosen companies or chosen users. Type (information / important / maintenance) sets the banner colour; optional link; optional email copy through the platform mail server; optional acknowledge button; send now or schedule; stops after 3 days, 7 days, a date or when withdrawn. History shows audience, who sent it and a read rate, with a Withdraw button. Delivered as one PLATFORM_BROADCAST notification per active member of an active company (suspended and closed companies are skipped), so it also appears in the bell and History. A scheduled broadcast is delivered the first time any browser polls after its start time. New tables PlatformBroadcast, Notification.broadcastId (migration).

Platform Users: grouped by company with collapsible groups (Flo X staff first), an expand/collapse all control and a flat list with a Company column. Searching also matches a company name, and opens every group.

Advertising: a Preview button on each saved ad opens the real sidebar card with who it is shown to, its timeslots, status and results, without opening the editor.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
