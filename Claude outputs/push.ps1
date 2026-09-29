cd "C:\Projects\Apollo X Working"
git add -A
@"
Redesign print templates, size up logos, remove Component type, add
company address

Job Card, Job History, and the job's own Delivery Note are reworked to
match a new set of layout requests: side-by-side sections (Customer +
Machine/component on Job History; Job details + Commercial & logistics
on both Job Card and Job History), Job History's Parts List now starts
its own printed page with Outwork following it, and Job History gains
a company logo top-right for the first time (previously the only print
view without one).

Job Card: the Date in table, the Machine/component table, and the Job
type row are each constrained to half the page width; Job description
is pulled out of the label/value table into its own heading with the
text below it, on its own line, as requested.

The job's own Delivery Note (distinct from the supplier-facing outwork
delivery note) is reworked to match that outwork note's format:
Customer details and Commercial & logistics are now plain stacked-line
blocks (no table borders) sitting side by side, Job Type is gone
entirely, a new items table captures Make/Model/Component/Serial under
Description with an editable Qty field (no Checked column), and
Dispatched by/Received by signature blocks were added exactly like the
outwork note. Since Qty needs to stay editable, this is the one print
view that no longer auto-prints on load -- it opens with an on-screen
Print button instead. The delivery date field moved from the
Commercial block to sit below the job number in the header, matching
outwork's own "date captured" placement.

Company logos on all delivery-note-style prints (outwork, job delivery
note, and the newly-added Job History) are sized up from a 56x200px cap
to 80x240px so they read closer to the width of the company name text
beside them.

"Component type" is removed from the job's Machine/component details
form and from every print that showed it (Job Card, Job History). The
underlying Job.componentType column, Import/Export mapping, Excel sync,
the Jobs-list optional column, and the PEX unit-description fallback
are all left untouched -- this only removes the field from the job
screen and from prints, per the scope confirmed before starting.

Settings > Company gains an Address section (line 1/2, city, province,
postal code), writing to the existing but previously unused
CompanyAddress relation. Every print that already renders company org
details (outwork delivery note, job delivery note, and now Job History)
already reads that same relation via getCompanyPrintDetails, so no
further changes were needed for the address to start appearing on
those documents once saved here.

src/components/JobWorkspace.tsx, src/components/CompanySettingsForm.tsx,
src/lib/master-data/company-settings-service.ts.
"@ | Set-Content -Encoding utf8 commit-msg.txt
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
