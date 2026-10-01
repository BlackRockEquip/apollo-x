cd "C:\Projects\Apollo X Working"
git add -A
@"
Support tickets: table view, modal detail, reply notifications, delete, status

Org Admin ticket list (Settings -> Support) is now a table - Ticket Number,
Date received, User, Priority, Status - instead of a card list, replacing
SupportWorkspace.tsx's old .record-list. Clicking a row (or its Open button)
opens the ticket in a centered modal dialog (createPortal + the same
.drawer-backdrop/.form-drawer.compact-dialog pattern used by
SupportRequestDialog.tsx/ConfirmDialog.tsx, new .support-ticket-dialog width
modifier in globals.css) instead of rendering the detail inline below the
grid.

Added a delete button (Org Admins only, gated on USERS_MANAGE same as the
rest of this page's admin-only controls) - new deleteTenantSupportTicket in
support/service.ts, new DELETE handler on
app/api/v1/support/[id]/route.ts. SupportTicketMessage/Event/Attachment all
cascade-delete with their parent SupportTicket already, so this is a plain
delete.

Replies now close the loop both ways: when an Org Admin replies, the
original reporter gets a notification; when the reporter replies, Org
Admins get notified - new SUPPORT_TICKET_REPLY NotificationType (schema.prisma
+ matching migration), new single-recipient notifyUser helper
(notifications/service.ts), both wired into replyToSupportTicket
(support/service.ts).

Org Admins can change a ticket's status - Open / In Process / Closed - from
a select in the ticket modal. New updateTenantSupportTicketStatus in
support/service.ts (deliberately a narrower 3-state enum than the
platform-support status field - WAITING_ON_CUSTOMER/RESOLVED stay
platform-only, set automatically elsewhere), new PATCH handler on
app/api/v1/support/[id]/route.ts.

prisma/schema.prisma,
prisma/migrations/20261001190000_support_ticket_reply_notification/migration.sql,
src/lib/notifications/service.ts, src/lib/support/service.ts,
src/app/api/v1/support/[id]/route.ts, src/components/SupportWorkspace.tsx,
src/app/globals.css.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
"@ | Set-Content -Encoding utf8 commit-msg.txt
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
