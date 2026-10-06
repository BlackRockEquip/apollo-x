cd "C:\Projects\Apollo X Working"
# New migration 20261006100000_support_ticket_tenant_soft_delete is applied by the deploy's "prisma migrate deploy".
# For your local copy afterwards:  npx prisma migrate dev ; npm run prisma:generate
git add -A
@"
Support: an Org Admin deleting a ticket no longer deletes it for Platform support

User request: when an Org Admin deletes a support ticket it must not be deleted
from the platform admin account, so history is kept.
- SupportTicket gains tenantDeletedAt / tenantDeletedById (migration
  20261006100000_support_ticket_tenant_soft_delete). deleteTenantSupportTicket now
  sets them (soft delete) and records a DELETED_BY_ORGANISATION event + audit entry
  instead of removing the row.
- Hidden for the organisation: ticket list, ticket detail, reply, status change,
  ticket file downloads and the company dashboard's support widgets.
- Platform support still sees the ticket with all messages, files and events, marked
  "Deleted by organisation" in the list and detail header.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
"@ | Set-Content -Encoding utf8 commit-msg.txt
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
