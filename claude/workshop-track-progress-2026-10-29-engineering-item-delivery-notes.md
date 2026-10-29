# Engineering: delivery note per item (2026-10-29)

**Request:** after multi-item jobs, "per item delivery note next" (items are rarely ready the same day, so each delivery lists only the items going out).

## How it works
- On a multi-item job the existing **Delivery note** window (Actions menu, or the new button on the item list) opens with an **Items on this delivery** picker. Items at *To be delivered* are ticked; ticking/unticking adds or removes that item's line (tag · component · model · S/N · machine). Typed lines still work.
- The note carries **its own delivery date** (defaults to today, editable) - the job's single delivery date is not used for these notes (`deliveryDate` override on `buildJobDeliveryNoteSpec` and the print window).
- After printing, the "save PDF" offer names the file with the items on it (`... - Delivery note - Items 1, 3`) so a second delivery does not replace the first.
- If "move the ready items on this note to Delivered / Await payment" is left ticked (not offered to mechanic/view-only users), the ticked items that were *To be delivered* are PATCHed to Delivered / Await payment one by one, after the Engineering documents check. Ticked items that were not ready stay as they are. The existing roll-up moves the job to Delivered / Await payment when the last item has gone out.
- The item list's status box now runs the same "Are all documents uploaded?" check as the job stepper when an item moves to To be delivered or later.
- Jobs with no items: unchanged.

## Where
`src/lib/jobs/item-model.ts` (itemDeliveryLine, defaultDeliveryPicks, itemsToMarkDelivered, deliveryNoteSuffix; tests in `tests/unit/job-items.test.ts`, now 21), `src/components/JobWorkspace.tsx` (dialog picker, printDeliveryNoteAndMove, toggleDeliveryItem), `src/components/job-items/JobItemsPanel.tsx` (button + document check), `src/lib/documents/job-specs.ts`, `globals.css` (`ji-pick`). No migration, no new endpoint.

## Not done
- No delivery note number / register of past notes on the job (the saved PDFs in the job folder are the record).
- Job-level Delivery date column stays empty on multi-item jobs.
- Parts, outwork, specifications, photos still per job; printed job card shows item 1 only; mechanic tablet view has no items list.
