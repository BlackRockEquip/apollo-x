cd "C:\Projects\Apollo X Working"
# Failure Reports: page 1 / page 2 photos chosen one by one, bulk photos from page 3, Print preview. ONE MIGRATION.
npx prisma migrate deploy
npx prisma generate
git add -A
@'
Failure Reports: page 1 and 2 photos chosen one by one, bulk photos from page 3, Print preview

- User: "When adding photos, photos should be added from page 3, page 1 and 2 a user should be able to select individually."
  FailureReportPhoto.role: cover (page 1) / intro (page 2) / page (photo pages). Photos added in bulk go to the photo pages.
  Page 1 and page 2 each have their own slot: Choose / Replace a photo, or pick one already on the photo pages, Move to photo
  pages, Delete. A photo already in a slot moves to the photo pages when another takes its place (nothing is lost). Photo-page
  photos have P1 / P2 buttons. Reports made before this keep their look (migration: first photo = cover, second = page 2).
- User: "add also a print preview button to the top of page". Print preview draws the pages from the same layout code as the
  PowerPoint (buildPptx with a recording deck), at real size; Print / Save as PDF prints them at the report's page size.
- Migration 20261126130000_failure_report_photo_role.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Uze9oWQMSgA2rwfJEsDMsg
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
