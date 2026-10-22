<#
.SYNOPSIS
  Insta360 Studio steps on the Windows GPU machine (docs/bulut-isleme.md).

.DESCRIPTION
  setup : installs uv and orchados-ingest (from a copy of services/ingest).
  pull  : downloads the session's camera originals (camera/*) to D:\orchados\<session>\camera.
  push  : uploads Studio's equirectangular MP4 export to the session as video/*.mp4,
          then verifies the stored session.
  The raw store comes from ORCHADOS_STORE_* environment variables or
  %APPDATA%\orchados\ingest.toml; credentials from the provider's standard chain.

.EXAMPLE
  .\studio-job.ps1 setup -IngestSource C:\orchados\services\ingest
  .\studio-job.ps1 pull -SessionId 4f2a9c1e-...
  .\studio-job.ps1 push -SessionId 4f2a9c1e-... -ExportDir D:\orchados\4f2a9c1e-...\export
#>
param(
  [Parameter(Mandatory = $true, Position = 0)][ValidateSet("setup", "pull", "push")][string]$Step,
  [string]$SessionId,
  [string]$IngestSource,
  [string]$WorkRoot = "D:\orchados",
  [string]$ExportDir
)
$ErrorActionPreference = "Stop"

function Require-Session {
  if (-not ($SessionId -match '^[A-Za-z0-9_-]{1,64}$')) { throw "-SessionId is required" }
}

switch ($Step) {
  "setup" {
    if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
      powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
      $env:Path = "$env:USERPROFILE\.local\bin;$env:Path"
    }
    if (-not $IngestSource) { throw "-IngestSource <path to services/ingest> is required" }
    uv tool install --force $IngestSource
    orchados-ingest --version
    orchados-ingest config
  }
  "pull" {
    Require-Session
    $dest = Join-Path $WorkRoot $SessionId
    orchados-ingest pull $SessionId $dest --include "camera/*"
    Write-Host "Open the files under $dest\camera in Insta360 Studio and export to $dest\export"
  }
  "push" {
    Require-Session
    if (-not $ExportDir) { $ExportDir = Join-Path (Join-Path $WorkRoot $SessionId) "export" }
    orchados-ingest push $ExportDir --session-id $SessionId --layout video
    orchados-ingest verify $SessionId
    if ($LASTEXITCODE -ne 0) { throw "verify failed" }
  }
}
