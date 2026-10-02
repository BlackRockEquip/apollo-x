cd "C:\Projects\Apollo X Working"
git add -A
@"
Extend dropdown-close-on-blur fix to every remaining typeahead

Follow-up to the parts-table supplier picker fix: the same onBlur-based
closeDropdownUnlessWithin() pattern is now applied to every other
typeahead dropdown in the system that had the same "stays open when you
click into another field" bug.

- JobKitsWorkspace.tsx: the "Part" typeahead on a kit line.
- MasterDataWorkspace.tsx: the "Keep this X" / "Merge this X in" pickers
  on the merge-duplicates drawer.
- OutworkAllWorkspace.tsx: Job and Supplier pickers on "Create outwork".
- RfqAllWorkspace.tsx: Supplier and Job pickers on "Add RFQ".
- PartySelector.tsx: the shared customer/supplier picker component used
  across several screens - fixing it here covers every page that renders
  it.
- StockLevelsWorkspace.tsx: the job picker on "Create picking slip".
  This one needed a different fix to the others - its input and its
  dropdown list aren't nested inside a common wrapper (they're siblings
  in the drawer), so the simple "blur the wrapping label" approach used
  everywhere else would have closed the list before a click on one of
  its own options could register. Wrapped both in a new container div
  that carries the onBlur instead, with matching spacing so nothing
  shifts visually.

Each dropdown closes as soon as focus moves outside its own container,
but not when focus moves to one of its own option buttons, so clicking
an option still works exactly as before.

src/components/JobKitsWorkspace.tsx, MasterDataWorkspace.tsx,
OutworkAllWorkspace.tsx, RfqAllWorkspace.tsx, PartySelector.tsx,
StockLevelsWorkspace.tsx.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
"@ | Set-Content -Encoding utf8 commit-msg.txt
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
