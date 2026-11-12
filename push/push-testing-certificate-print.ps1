cd "C:\Projects\Apollo X Working"
# Testing Reports: printed report rebuilt as the Transmission Test Certificate. No migration.
git add -A
@'
Testing Reports: printed report is now the Transmission Test Certificate

- New printed layout from the Black Rock certificate: company logo and details top right, certificate / report number box, then sections A Job details, B Unit identification, C Test data (gauge cards with IN SPEC / RECORDED pills), D Clutch pressures (spec, window bar and actual for each side, Neutral row highlighted), E Comments and result.
- Big PASSED / FAILED result boxes (the one that applies is filled, the other is greyed), with the reasons listed under a failed result. Pass with comment and pass with note keep their own wording.
- Signature lines: technician name, supervisor name and signature, date. Footer is the company name, report number, result and spec revision.
- The report now carries the machine make and the customer order / reference from the job (the order / reference is hidden from users who cannot see customers). The company print details now include the web address.
- Engaged-clutch templates print in the same style.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
