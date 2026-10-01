cd "C:\Projects\Apollo X Working"
git add -A
@"
Fix broadcasting to specific users failing with "No valid recipients were
selected"

GET /api/v1/users returns each row's `id` as the CompanyMembership id (the
real User id is in a separate `userId` field - membershipId is what
UsersWorkspace.tsx needs for its own edit/delete actions). BroadcastComposer.tsx
was reading `u.id` as a recipient's id and posting that, but
sendCompanyBroadcast (notifications/service.ts) validates "individual"
recipients against each active membership's real `userId` - so every
selected recipient failed that check, targetIds ended up empty, and it
threw "No valid recipients were selected." "All" mode never hit this since
it skips the per-id filter entirely and sends to every active member's
userId directly - which is why only "All" worked. Fixed by keying
BroadcastComposer's UserOption off `userId` instead of `id`.

src/components/BroadcastComposer.tsx.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
"@ | Set-Content -Encoding utf8 commit-msg.txt
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
