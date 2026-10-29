# Workshop Track progress - 2026-10-29 - Printouts: company details right aligned

Request: when printing, keep the company details right aligned; customer / supplier details stay as is.

- `src/components/JobWorkspace.tsx`: `.org-details{text-align:right}` in the three print windows that put the company block top-right under the logo: job delivery note, outwork delivery note, field service report. Before, the block sat on the right but its lines were left aligned.
- Customer / supplier / commercial blocks unchanged. No migration. Push script: `push/push-print-company-details-right.ps1`.
