# Parts follow-up dialog: refined look (2026-10-29)

User: "tidy up spacing and look professional", mockup first (Design canvas "Parts Follow-up Result Dialog", 4 states), then "yes build it like this".

## What changed
- `JobWorkspace.tsx`: the follow-up result dialog is rebuilt as a self-contained modal (no longer the generic form-drawer styles): 44px icon tile (red error, green sent, amber partly sent, blue info), blue "Parts follow-up" label, 20px bold title, one-line summary, "Sent to" / "Not sent" sections with count badges and one tinted card per supplier (name bold, reason muted), grey footer strip with the gold OK button. 480px wide, 16px corners, soft shadow; closes with OK, X or click outside.
- Email not set up / other failures with no supplier list: one tinted box, message in bold, optional second line underneath. The email-not-set-up case reads "Email isn't set up for this company yet, so no follow-up was sent." / "Add the SMTP email details under Settings > Company / Branding first, then try again."
- `lib/jobs/followup-outcome.ts`: `followupErrorOutcome(message, detail?)`; test updated (5 passing).

## Deploy
`push\push-parts-followup-dialog-polish.ps1`, no migration.
