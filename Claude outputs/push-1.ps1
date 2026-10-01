cd "C:\Projects\Apollo X Working"
git add -A
@"
Loose part-number matching for stock cross-check; Add/Import Parts button styling

Adding/importing parts to a job ("Add / cross-check with stock" and the
Excel/CSV import) resolves the typed/pasted part number through
findPartByNumber (inventory/parts-lookup.ts). That only ever did an exact
match (after trim/uppercase) against the part's own number or an alternate
number, so "3j1907" never matched a stock part filed as "3J-1907" - punctuation
and spacing had to match exactly. Added a third fallback tier that strips
every non-alphanumeric character from both sides (new looseNormalized helper,
master-data/validation.ts) before comparing, via a raw query using Postgres's
regexp_replace so the stored partNumberNormalized/numberNormalized columns
and their unique constraints are untouched - this only changes what's willing
to match, never what's stored. Only reached when the two exact-match tiers
above have already missed, so the common case (typing the part's real number)
is unaffected. findPartByNumber is the one shared lookup used everywhere a
raw part number is resolved (Stock Levels search, job kits, RFQ matching, as
well as adding/importing parts to a job), so this fix applies everywhere that
matching happens, not just the job parts flow that surfaced it.

Also: the "Add/Import Parts" button (job parts panel) moved to the left of
its row (was right-aligned via the shared .detail-actions footer class - left
aligned here with an inline override rather than touching that shared class)
and now uses .section-action-button, the same gold-accent style as the
"Create picking slip" button, instead of the plain .quiet-button it had.

src/lib/master-data/validation.ts, src/lib/inventory/parts-lookup.ts,
src/components/JobWorkspace.tsx.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
"@ | Set-Content -Encoding utf8 commit-msg.txt
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
