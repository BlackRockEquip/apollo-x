cd "C:\Projects\Apollo X Working"
git add -A
@'
Jobs: tabbed Parts card (Parts list / Pick slips / Follow-up) on every job type

- The Parts list, Generated pick slips and Parts follow-up sections are now tabs of
  one Parts card on all job types, as on Field service jobs. Pick slips shows once
  the job has parts; Follow-up shows while ordered parts are outstanding.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UwKrkxX8njJN9P2UvfUiGX
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
