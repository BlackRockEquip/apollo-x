cd "C:\Projects\Apollo X Working"
# Engineering: link parts, outwork, photos, files and specification reports to an item. Has a migration (20261029140000_job_item_links) - it runs on deploy.
git add -A
@'
Engineering: link parts, outwork, photos, files and specification reports to an item

On a multi-item job, parts, outwork lines, photos, attachments and specification (dimension) reports can each be tied to one item of the job, or left on the whole job (what everything already on file is).

Where you add them there is now a "For item" picker: the Add parts box, each outwork line in Record outwork, the photo and file upload boxes, and the specification report window. Existing records have a small item picker (parts, files and photos) or an Edit field (outwork) to move them to an item or back to the whole job. An item tag shows on each row.

The Parts, Outwork, Photos, Attachments and Specifications lists get an item filter (All items / one item / Whole job). The item list on the job screen shows what is tied to each item ("3 parts, 1 outwork, 2 photos"), and removing an item keeps its records on the job as whole-job records.

Pick slips print the item tag in front of each part's description. The parts list (print, saved PDF, Excel), job history and outwork delivery note do the same. The same part for two different items stays two lines instead of being merged into one.

Jobs with no items look and work exactly as before. New nullable itemId column on part lines, outwork items, job attachments and dimension reports (migration 20261029140000_job_item_links, no backfill). One shared endpoint (POST /api/v1/jobs/:id/item-links) moves an existing record to an item.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
