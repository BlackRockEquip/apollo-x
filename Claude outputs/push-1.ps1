cd "C:\Projects\Apollo X Working"
git add -A
@"
Notification history/sound, support ticket escalation flow, Org Admin
broadcasts, bulk-update toolbar/button restyle, change-password modal
centering fix, undo for Returned Unrepaired

Notifications: removing one now moves it to a History tab instead of
deleting it (new Notification.dismissedAt column; dismissNotification in
notifications/service.ts) - the /notifications page (NotificationsList.tsx)
gets an Active/History tab strip, a Remove button per active row, and a
small "Notification sound" settings panel at the bottom (on/off + a choice
of generated tones - Chime/Ping/Soft bell/No sound - via the new
notification-sound.ts, Web Audio API, no audio files shipped). The bell
(NotificationBell.tsx) plays the chosen tone when the unread count goes up
between polls, not just whenever it's nonzero.

Parts list bulk-update toolbar: the Order number/Supplier fields and the
three action buttons used to be one plain 2-column form grid (each button
its own row). Restyled as a single flex row - fields capped to roughly a
quarter of the toolbar's width, the Apply/Mark received/Delete buttons
grouped together next to them (JobWorkspace.tsx, new .bulk-update-toolbar
CSS).

"Create picking slip" now uses the same .section-action-button styling as
"Request quotes from suppliers," instead of the plainer .quiet-button it
had before.

Change password: the popup used to render behind/clipped to the page
header - .topbar has backdrop-filter, which creates a new containing block
for position:fixed descendants, and the dialog is a DOM child of the
header. Fixed by rendering the dialog through a React portal straight onto
document.body (escaping that ancestor entirely) and switching it to the
same centered .compact-dialog pattern already used everywhere else in this
app, matching "window must popup in center."

Support: clicking Support in the header used to just link to the /support
page with no prompt, which read as doing nothing. It's now a quick popup
(SupportRequestDialog.tsx) to describe the problem, posting to the same
support-ticket system as before (nothing about ticket storage changed).
New: creating a ticket now notifies someone. A non-Org-Admin's ticket
notifies this company's Org Admins (notifyCompanyAdmins, a new
Notification type). An Org Admin's own ticket has no more-senior tenant
recipient, so it escalates straight to platform support staff instead - a
new platform-side notification system (PlatformNotification model,
lib/platform/notifications.ts, a bell in PlatformShell's topbar, and
/platform/notifications) addressed to every active platform role holder
whose permissions include PLATFORM_SUPPORT_READ, the same gate that
already controls who can see a ticket at all.

Org Admin broadcast messages: a new "Broadcast message" tab on Settings >
Users (USERS_MANAGE-gated, same as the rest of that page) lets an Org
Admin send a message to every user or a chosen few. Delivered as a regular
notification (bell + History, same as anything else) plus a dismissible
banner at the top of every page (BroadcastBanner.tsx) until it's read or
dismissed - the "popup" from the request.

Mark returned unrepaired: now has an Undo button next to it once a job is
flagged, clearing the same returnedUnrepaired/reason/timestamp fields the
original action set (undoJobReturnedUnrepaired in jobs/service.ts).

src/components/ChangePasswordButton.tsx, src/components/JobWorkspace.tsx,
src/components/NotificationBell.tsx, src/components/NotificationsList.tsx,
src/components/NotificationSoundSettings.tsx,
src/components/SupportRequestDialog.tsx, src/components/BroadcastBanner.tsx,
src/components/BroadcastComposer.tsx, src/components/UsersWorkspace.tsx,
src/components/AppShell.tsx, src/components/PlatformShell.tsx,
src/components/PlatformNotificationBell.tsx,
src/components/PlatformNotificationsList.tsx, src/lib/jobs/service.ts,
src/lib/notifications/service.ts, src/lib/notification-sound.ts,
src/lib/platform/notifications.ts, src/lib/support/service.ts,
src/app/(tenant)/notifications/page.tsx,
src/app/platform/notifications/page.tsx,
src/app/api/v1/jobs/[id]/returned-unrepaired/undo/route.ts,
src/app/api/v1/notifications/[id]/dismiss/route.ts,
src/app/api/v1/notifications/active-broadcast/route.ts,
src/app/api/v1/notifications/broadcast/route.ts,
src/app/api/v1/platform/notifications/route.ts,
src/app/api/v1/platform/notifications/unread-count/route.ts,
src/app/api/v1/platform/notifications/[id]/read/route.ts,
src/app/api/v1/platform/notifications/read-all/route.ts,
src/app/globals.css, prisma/schema.prisma,
prisma/migrations/20261001170000_notifications_phase2/migration.sql.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
"@ | Set-Content -Encoding utf8 commit-msg.txt
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
