$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$existing = Get-NetTCPConnection -LocalPort 8080 -ErrorAction SilentlyContinue |
  Where-Object { $_.State -eq "Listen" } |
  Select-Object -First 1

if ($existing) {
  Write-Host "Local server already listening on http://127.0.0.1:8080"
  exit 0
}

$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
  $pythonPath = Join-Path $env:LOCALAPPDATA "Programs\Python\Python314\python.exe"
  if (Test-Path $pythonPath) {
    $python = [pscustomobject]@{ Source = $pythonPath }
  }
}

if (-not $python) {
  throw "Python was not found. Install Python or edit this script with the correct python.exe path."
}

Start-Process `
  -FilePath $python.Source `
  -ArgumentList "serve.py" `
  -WorkingDirectory $root `
  -WindowStyle Hidden

Start-Sleep -Seconds 2
$status = (Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:8080/" -TimeoutSec 5).StatusCode
Write-Host "Local server ready: http://127.0.0.1:8080 ($status)"
