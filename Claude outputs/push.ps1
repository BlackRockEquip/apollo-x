cd "C:\Projects\Apollo X Working"
git add -A
@"
Move RFQ quote entry into a dedicated Compare quotes dialog

User request: "on the RFQ form for parts, move the import quote section
to its own place. Eg: add a 'Compare quotes' button next to bulk update
button which lets the user view the suppliers requested from in table
form next to each other, allow user to import quote received for the
respective supplier or fill in amounts next to part number."

Previously, entering a supplier's quote meant clicking "Record quote" on
one row of the RFQ popup's supplier list, which opened a drawer for that
ONE supplier only (its own file upload, notes, and a Part/Available/
Unit price/Notes table) -- comparing across suppliers meant closing that
drawer, opening another supplier's, and mentally tracking the numbers
between them. A read-only "Quote comparison" table further down could
show suppliers side by side, but only once every price was already
saved -- not while entering them.

New "Compare quotes" button, next to "Bulk update" on the Parts list
toolbar (disabled until at least one supplier has been asked to quote),
opens its own dialog with one column per requested supplier in a single
table -- part numbers down the left, an editable unit-price cell (with an
N/A toggle) per supplier per part. Each supplier's column header carries
its own "Import quote file" control (same best-effort price extraction
as before -- fills blanks only, never overwrites a typed price), an
optional notes field, and its own Save button, so any number of
suppliers can be filled in or imported side by side in one view instead
of one drawer at a time. A live (unsaved) total per column updates as
you type, before Save is clicked.

The existing read-only comparison -- star-pick a preferred price per
part, cheapest-price highlighting, per-supplier and preferred totals,
CSV export -- is kept directly below the entry grid in the same dialog
(still only shown once at least one quote is actually saved), so the
"enter/import" and "compare what's saved" views live together instead of
being split across two different popups.

The RFQ send popup's per-supplier "Record quote"/"Edit quote" button now
reads "Compare quotes" and opens this same dialog, closing the RFQ popup
first so the two don't stack.

No schema or API change -- same quote/quote-lines endpoints as before,
now called per supplier column instead of per single "current" edit
target. JobWorkspace.tsx and globals.css only.
"@ | Set-Content -Encoding utf8 commit-msg.txt
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
