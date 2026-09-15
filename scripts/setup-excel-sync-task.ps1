# Registers a Windows Scheduled Task that starts the Excel-sync bridge
# (scripts/excel-sync-bridge.ts, run via "npm run excel-sync:bridge")
# automatically whenever you log into Windows, and keeps it running
# continuously in the background - so the bridge that pushes your
# OneDrive-synced WIP workbook to the deployed Apollo X app on Render
# doesn't depend on remembering to open a terminal and start it by hand.
#
# Prerequisite: EXCEL_SYNC_API_KEY and EXCEL_SYNC_TARGET_URL must already be
# set in your local .env (copy EXCEL_SYNC_API_KEY from the Render dashboard's
# Environment tab for the apollox-staging service; set EXCEL_SYNC_TARGET_URL
# to your live app's URL, e.g. https://apollox-staging.onrender.com). The
# bridge script checks for these itself and logs a clear error to
# logs\excel-sync-bridge.log if they're missing - the task will just keep
# restarting and re-logging that error until they're set.
#
# Run this ONCE, from a normal PowerShell prompt (it elevates itself - see
# below, so you don't need to already be in an admin prompt), in this repo
# folder:
#   npm run excel-sync:task:install
# (or directly: powershell -ExecutionPolicy Bypass -File scripts/setup-excel-sync-task.ps1)
#
# What it does:
#  - Registering a Scheduled Task requires an administrator token even for a
#    task that will only run as your own normal account later - Windows
#    itself enforces this regardless of the task's own settings. So this
#    script checks whether it's running elevated and, if not, relaunches
#    itself with a UAC prompt (you'll see the standard Windows "Do you want
#    to allow this app to make changes?" dialog - click Yes). This is a
#    one-time step for registration only.
#  - Builds the task as a Task Scheduler XML definition and registers it via
#    schtasks.exe /Create /XML, rather than PowerShell's own
#    Register-ScheduledTask cmdlet. Register-ScheduledTask talks to Task
#    Scheduler through the WMI/CIM provider, which on some Windows machines
#    fails with a plain "Access is denied" (HRESULT 0x80070005) regardless
#    of the caller's actual privilege level - a known quirk of that specific
#    provider, not a real permissions problem. schtasks.exe talks to Task
#    Scheduler directly and is far more consistently reliable.
#  - The resulting task is named "ApolloX Excel Sync Bridge", runs
#    `npm run excel-sync:bridge` at logon with its console window hidden,
#    appends all output to logs\excel-sync-bridge.log, restarts automatically
#    (up to 999 times, once per minute) if the process ever exits, and has no
#    execution time limit (Task Scheduler's own default would otherwise kill
#    it after 72 hours, silently stopping the sync after 3 days).
#  - The task itself then runs under your own Windows account, only while
#    you're logged in - no admin rights or stored credentials needed for it
#    to actually run. The elevation above is only for the one-time
#    registration step.
#  - Safe to re-run - replaces any existing task with the same name (/F)
#    rather than erroring or creating a duplicate.
#
# To check on it later:
#   Get-ScheduledTaskInfo -TaskName "ApolloX Excel Sync Bridge"
#   Get-Content logs\excel-sync-bridge.log -Tail 20 -Wait
# To remove it:
#   schtasks /Delete /TN "ApolloX Excel Sync Bridge" /F

$ErrorActionPreference = "Stop"

# Registering a Scheduled Task needs an elevated token (Windows enforces
# this on the registration call itself - it's unrelated to what account or
# privilege level the task will actually run with afterward). If this
# script wasn't started elevated, relaunch itself with a UAC prompt instead
# of failing with "Access is denied" partway through.
$currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal($currentIdentity)
$isElevated = $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isElevated) {
    Write-Host "Registering a Scheduled Task requires administrator rights - requesting elevation (a Windows UAC prompt will appear; click Yes)..."
    $relaunchArgs = '-NoProfile -NoExit -ExecutionPolicy Bypass -File "{0}"' -f $PSCommandPath
    Start-Process -FilePath "powershell.exe" -ArgumentList $relaunchArgs -Verb RunAs | Out-Null
    exit
}

$root = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $root "logs"
$logFile = Join-Path $logDir "excel-sync-bridge.log"
$taskName = "ApolloX Excel Sync Bridge"

if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir | Out-Null
}

# Resolve npm to a real file path the same way start-db.ps1 resolves
# pg_ctl.exe - a Scheduled Task action needs an actual executable, not
# something that only works via PATH/PATHEXT lookup at an interactive
# prompt.
$npmCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npmCmd) { $npmCmd = Get-Command npm -ErrorAction SilentlyContinue }
if (-not $npmCmd) {
    Write-Error "Could not find npm on PATH. Install Node.js (which bundles npm) first, then retry."
    exit 1
}

# Run through cmd.exe /c so the ">>" log redirection works reliably and the
# whole pipeline (cmd -> npm -> tsx -> node) is one process tree Task
# Scheduler tracks and can restart as a unit.
#
# Built with the -f format operator on a single-quoted template (rather than
# backtick-escaped quotes inside a double-quoted string) so there is no
# backtick escaping anywhere in this file for a transfer/encoding step to
# mangle.
$command = 'cd /d "{0}" && "{1}" run excel-sync:bridge >> "{2}" 2>&1' -f $root, $npmCmd.Source, $logFile
$arguments = "/c " + $command

# Minimal XML-text escaping for the one special character ("&", from the
# "&&" in $command) that isn't legal as-is inside XML element text. Applied
# generically in case any of the paths above ever contain "&", "<" or ">".
function ConvertTo-XmlText([string]$Text) {
    $Text.Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;")
}

$taskXml = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Watches the WIP Excel workbook and pushes changes to the deployed Apollo X app. See scripts/excel-sync-bridge.ts.</Description>
  </RegistrationInfo>
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
    </LogonTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>true</Hidden>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>7</Priority>
    <RestartOnFailure>
      <Interval>PT1M</Interval>
      <Count>999</Count>
    </RestartOnFailure>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>cmd.exe</Command>
      <Arguments>$(ConvertTo-XmlText $arguments)</Arguments>
    </Exec>
  </Actions>
</Task>
"@

$xmlPath = Join-Path $env:TEMP "apollox-excel-sync-task.xml"
# schtasks.exe expects the XML file itself encoded as UTF-16LE with a BOM
# (matching the encoding="UTF-16" declaration above) - Out-File's "Unicode"
# encoding is exactly that.
$taskXml | Out-File -FilePath $xmlPath -Encoding Unicode -Force

# Re-creating (rather than erroring if it already exists) makes this script
# safe to run again after, say, changing the npm script it invokes.
$schtasksOutput = & schtasks.exe /Create /TN $taskName /XML $xmlPath /F 2>&1
$schtasksExitCode = $LASTEXITCODE
Remove-Item $xmlPath -ErrorAction SilentlyContinue

if ($schtasksExitCode -ne 0) {
    Write-Host "schtasks.exe reported an error (exit code $schtasksExitCode):"
    Write-Host ($schtasksOutput | Out-String)
    Write-Host ""
    Write-Host "This means something below the app itself is blocking Task Scheduler changes on this machine - not this script. Worth checking:"
    Write-Host "  Get-Service Schedule                (the Task Scheduler service itself should be Running)"
    Write-Host "  whoami /groups | findstr /i admin   (confirms this account is actually an administrator)"
    Write-Host "If this is a work/managed PC, antivirus or a Group Policy may be blocking new scheduled tasks - ask IT if so."
    Write-Host "In the meantime, you can still run the bridge manually with: npm run excel-sync:bridge"
    exit 1
}

Write-Host ("Scheduled task '{0}' created - it will start automatically next time you log in." -f $taskName)
Write-Host ""
Write-Host "To start it right now without logging out/in:"
Write-Host ('  schtasks /Run /TN "{0}"' -f $taskName)
Write-Host ""
Write-Host ("Output and errors are appended to: {0}" -f $logFile)
