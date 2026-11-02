# Workshop Track - progress 2026-11-02: Follow-up RFQ CCs the sending email (pr35)

**Request:** "in jobs the Follow up rfq should cc the sending email"

- Interpreted "the sending email" as the address the company sends from (Settings > Email > From address). Every parts follow-up email to a supplier now also goes to that address (CC), merged with the follow-up template's own CC list (Settings > Templates). De-duplicated, case-insensitive, and the supplier's own address is never copied.
- If email is not configured, nothing changes (follow-ups are skipped as before).
- Files: `lib/email.ts` (`getCompanySendingAddress`), `lib/email-template-fields.ts` (`ccWithSender`), `lib/jobs/parts-followup.ts`, `tests/unit/email-templates.test.ts` (+1 test). Push: `push/push-followup-cc-sender.ps1`. No migration.
- Not changed: the first RFQ email and the WIP email do not copy the sender (only the follow-up was asked for). If the user meant the logged-in person's own email instead of the company From address, swap `getCompanySendingAddress` for the user's email in `parts-followup.ts`.
