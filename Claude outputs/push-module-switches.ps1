cd "C:\Projects\Apollo X Working"
# Follow-up: per-user module switches in Settings > Users (only modules enabled on the platform side are listed).
# Safe to run whether or not push.ps1 has been run - git add -A picks up everything. No new migration.
# Needs the two previous pushes applied first (ETA cards + Job kits, then Engineering).
# Run the database migration afterwards with your usual process (prisma migrate deploy) - one new migration (20261016160000).
git add -A
@'
Settings > Users module switches; numbering save fix; New customer pop-up; no BRE wording

- Every module behind a tile shown on Settings > Users can be switched on or off for a single user, including modules that used to
  appear locked (RFQs, Outwork, Pick slips, Specifications, Field service, Warranty...). A module switched off is stored for that user
  only and denied for them everywhere (menus, pages, API), on top of the company licence.
- Only modules the platform admin has enabled for the company (and whose required modules are also enabled) are listed to the org admin.
- Platform Admin > Add user creates users with every module switched on.
- Fix: saving a Document numbering edit (or adding a sequence) no longer shows "The request could not be completed" - the change was saved but the
  response failed on the sequence's number counter; it now returns normally.
- Jobs > New job: New customer now opens a pop-up window (name, account code, trading name, contact, telephone, email, address, city) instead of fields
  that were hard to see in the page. Errors show inside the pop-up.
- Examples and hints no longer mention BRE / Black Rock for other companies: job search placeholder ("Search job #, linked job #..."), Document titles
  example, import hint, storage setup guides and the Workshop build example text use neutral wording (e.g. J00123).

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
