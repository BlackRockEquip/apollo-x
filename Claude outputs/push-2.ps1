cd "C:\Projects\Apollo X Working"
git add -A
@"
Job Kits: auto-create missing catalog parts on import; strip part-number
separators at input time everywhere, not just at lookup

1. Job Kits import "not found in parts catalog and skipped" (user report:
   "is it not suppose to add parts to the list without checking stock?")

Not a stock check - a catalog-existence check. JobKitLine.partId is a
required FK, so a number with no catalog match used to be skipped and
reported rather than added, unlike a Job's own parts list (which allows
free-text lines). addJobKitLinesBulk (job-kits/service.ts) now
auto-creates a bare-bones catalog Part for an unmatched number instead
(number + whatever description the row/file supplied, blank otherwise),
then adds it as a normal kit line. Still skipped and reported: a number
already recorded as another part's alternate/superseded/group number -
that's a real collision, not a missing catalog entry. Import summary
banner (JobKitsWorkspace.tsx) updated to report created-but-new parts
separately from genuinely-skipped rows.

2. Part numbers now stripped of separators at input time, not just
   matched loosely at lookup

Follow-up to the above, at the user's request: rather than only
matching "3J-1907" and "3J1907" as equivalent at lookup time
(looseNormalized, added previously), every place a part number is
typed, pasted or imported now strips hyphens/periods/slashes/spaces and
forces uppercase before it's checked, added or imported - so the
catalog only ever holds one spelling per part number going forward.

- partInput.partNumber and partAlternateNumberInput.number
  (master-data/validation.ts) transform through looseNormalized before
  validation completes - covers the manual Add/Edit Part form, Parts
  Catalog import, and Add alternate number in one place, since
  createMaster and updateMaster's "parts" case both parse through this
  same schema.
- Job parts list paste/import (addPartLinesBulk, jobs/service.ts) -
  JobPartLine.partNumber is stripped before being stored, whether or
  not the row matched a catalog part.
- Job Kits paste/import (addJobKitLinesBulk, job-kits/service.ts) - the
  new auto-created Part (see #1) gets the stripped number.
- Parts Catalog spreadsheet import (importParts, import-export/
  service.ts) - stripped right after the column is read, so the
  "already exists" duplicate pre-check compares the same clean form
  createMaster will end up storing, rather than missing a duplicate
  because the raw sheet spelling still had punctuation.

Existing part numbers already in the catalog are untouched by this
change - only new/edited/imported numbers get the clean treatment going
forward. (Per the user: they're separately exporting, cleaning and
re-importing the existing catalog themselves.)

src/lib/master-data/validation.ts, src/lib/jobs/service.ts,
src/lib/job-kits/service.ts, src/lib/import-export/service.ts,
src/components/JobKitsWorkspace.tsx.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
"@ | Set-Content -Encoding utf8 commit-msg.txt
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
