cd "C:\Projects\Apollo X Working"
git add -A
@"
Reorder Settings-Company fields, fit Job History on one page, tidy
delivery note description line

Settings > Company: moved the Logo & preview section to sit directly
below Address (it was previously the last section on the page, after
Email/SMTP).

Print Job History: tightened padding, margins and font sizes across
the view (body padding, heading margins, table cell padding) so the
Customer/Machine, Job details/Commercial, and any Notes/Field service/
Warranty sections reliably fit on one printed page before Parts list's
own page break kicks in; added page-break-after/page-break-inside
guards on headings, two-column blocks and tables so a section doesn't
get split awkwardly across a page boundary if content does still run
long. Also moved the company logo to sit on its own line above the
"Job record" heading, rather than beside it in the top-right corner.

Print Delivery Note (job-facing): the new items table's Description
cell used to show Make/Model/Component/Serial each on its own line
with a field label ("Make: X"). Now they're all on one line, values
only, separated the same way as the customer contact line and the Job
Kit applicability line elsewhere in this file (" · ").

src/components/JobWorkspace.tsx, src/components/CompanySettingsForm.tsx.
"@ | Set-Content -Encoding utf8 commit-msg.txt
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
