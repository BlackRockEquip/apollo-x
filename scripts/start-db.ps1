# Starts the disposable local Postgres cluster used by Apollo X's .env
# (127.0.0.1:55432, data dir under .test-postgres/) as a fully detached
# process, so closing this terminal window (or a stray Ctrl+C in it) doesn't
# take the database down with it.
#
# Why this matters: running `pg_ctl ... start` directly in a terminal still
# leaves postgres.exe attached to that terminal's console process group on
# Windows. Closing the window (or Ctrl+C) sends a close/interrupt signal to
# every process in that group, postgres included - see
# .test-postgres/cluster-start.log for a real case of exactly that
# (`background worker ... terminated by exception 0xC000013A`, Windows' code
# for "received a Ctrl+C / console-close signal"). Start-Process below
# launches postgres as a genuinely separate process instead, so it survives
# this terminal closing.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$dataDir = Join-Path $root ".test-postgres\data"
$logFile = Join-Path $root ".test-postgres\cluster-start.log"

# Start-Process needs pg_ctl resolved to a real file path - unlike calling
# "pg_ctl" directly at a prompt (or via the call operator "&"), it does not
# fall back to the same PATHEXT/App Paths lookup, so a bare "pg_ctl" here
# fails with "the system cannot find the file specified" even when it works
# fine typed into a terminal. Resolve it explicitly: PATH first, then the
# standard PostgreSQL installer locations.
function Resolve-PgCtl {
    $onPath = Get-Command pg_ctl.exe -ErrorAction SilentlyContinue
    if (-not $onPath) { $onPath = Get-Command pg_ctl -ErrorAction SilentlyContinue }
    if ($onPath) { return $onPath.Source }

    $searchRoots = @($env:ProgramFiles, ${env:ProgramFiles(x86)}) | Where-Object { $_ }
    foreach ($searchRoot in $searchRoots) {
        $found = Get-ChildItem -Path (Join-Path $searchRoot "PostgreSQL\*\bin\pg_ctl.exe") -ErrorAction SilentlyContinue |
            Sort-Object FullName -Descending | Select-Object -First 1
        if ($found) { return $found.FullName }
    }
    return $null
}

$pgCtl = Resolve-PgCtl
if (-not $pgCtl) {
    Write-Error "Could not find pg_ctl.exe on PATH or under a standard PostgreSQL install location. Add PostgreSQL's bin directory to PATH, or install PostgreSQL, then retry."
    exit 1
}

if (-not (Test-Path $dataDir)) {
    Write-Error "No cluster found at $dataDir - this script only starts an existing cluster, it does not create one."
    exit 1
}

Start-Process -FilePath $pgCtl -ArgumentList "-D `"$dataDir`" -l `"$logFile`" start" -WindowStyle Hidden

Write-Host "Starting Postgres (detached from this terminal) on 127.0.0.1:55432..."
Write-Host "Check $logFile if anything looks wrong. Give it a couple of seconds, then run 'npm run dev'."
