cd "C:\Projects\Apollo X Working"
# Platform admin, users and roles, document numbering and small fixes.
# Needs the two previous pushes applied first (ETA cards + Job kits, then Engineering).
# Run the database migration afterwards with your usual process (prisma migrate deploy) - one new migration (20261016160000).
git add -A
@'
Platform admin, user roles, document numbering and small fixes

Platform Admin
- Company colours: colour picker beside each hex field, with a live preview (company page and Add Company).
- Add Company now copies everything entered into the company's own settings: VAT and registration numbers, website,
  telephone, email, address, currency, quote validity and colours. New companies also start with the standard document sequences.
- Company page: full edit form (contact details, address, colours, header/footer). Saving no longer wipes settings the form does not show.
- Add user from the company page (name, email, password, role for the company's build) without entering support mode.
- Delete company button next to Open on the companies table: permanent, needs the internal code typed, Black Rock protected.

Users and roles
- Settings > Users: module access now shows the same module tiles as Platform Admin.
- Engineering roles limited to Company Admin, Manager, Store Controller, Machinist and WIP View (View Only). User Setup says Machinist.
- WIP View (View Only): can see Jobs and WIP only; job screen is read-only. Migration 20261016160000 adds the role.

Settings and other fixes
- Document numbering: every company has the default sequences (J, PEX, Q, SO, INV, PR, RFQ), so nothing needs adding by hand.
  New Sequence only offers document types without one. Preview button and a live preview in the form.
- Document titles: Preview button showing the title, logo and saved file name.
- RFQs module off: Email / SMTP section and the Templates tab are hidden.
- Sidebar shows the legal name when no trading name is set.
- Job screen: ticking N/A beside the payment date disables and clears the date.
- Jobs WIP custom columns: field names match the job screen.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
