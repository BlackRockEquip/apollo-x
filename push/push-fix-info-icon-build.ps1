cd "C:\Projects\Apollo X Working"
# Build fix: JobWorkspace.tsx imported the lucide "Info" icon while the file already has its own Info component,
# so Turbopack refused to build ("the name `Info` is defined multiple times"). The icon is now imported as InfoIcon.
# NO MIGRATION. Fixes both apollox-staging and apollox-demo deploys.
git add -A
@'
Fix build: Info icon name clashed with the Info component in JobWorkspace

The parts follow-up result dialog imported lucide's Info icon, but JobWorkspace.tsx already defines its own Info component, so the Render build failed with "the name Info is defined multiple times". The icon is imported as InfoIcon instead.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Uze9oYroUZVHECm1x9ArL4
'@ | Set-Content -Path commit-msg.txt -Encoding UTF8
git commit -F commit-msg.txt
Remove-Item commit-msg.txt
git push
