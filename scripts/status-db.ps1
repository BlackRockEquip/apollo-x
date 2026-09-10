# Quick check: is the local Postgres cluster (127.0.0.1:55432) up?
$root = Split-Path -Parent $PSScriptRoot
$dataDir = Join-Path $root ".test-postgres\data"

# See the matching comment in start-db.ps1 - npm invokes this with
# -NoProfile, so a PATH entry added only in a PowerShell profile script is
# not present here even if pg_ctl works fine in an ordinary terminal.
# Resolve it explicitly instead of assuming it is on PATH.
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
    Write-Error "Could not find pg_ctl.exe on PATH or under a standard PostgreSQL install location."
    exit 1
}

& $pgCtl -D "$dataDir" status
