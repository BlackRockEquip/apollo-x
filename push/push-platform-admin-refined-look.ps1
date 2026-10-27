cd "C:\Projects\Apollo X Working"
# Platform admin: refined visual design (sectioned sidebar, slim top bar, refined cards/tables/forms). No migration.
git add -A
@'
Platform admin: refined look (Flo X navy and gold)

New scoped stylesheet src/app/platform/platform-theme.css, applied only inside .platform-shell so the company side is untouched. Sidebar is grouped into Operate / Support and sales / Platform with a gold active marker, a gold count badge for new demo requests and a user card at the foot. Slim frosted top bar with a breadcrumb, bell, change password and logout. Cards, toolbars, tables, status pills, buttons, form fields and tab strips get the refined spacing, borders and gold focus styling. "Setup" is renamed "Proposal setup".

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
