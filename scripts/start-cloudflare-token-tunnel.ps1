$ErrorActionPreference = "Stop"

param(
  [string]$Token = $env:CLOUDFLARED_TOKEN
)

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not $Token -and (Test-Path "cloudflare-token.txt")) {
  $Token = (Get-Content -Raw "cloudflare-token.txt").Trim()
}

if (-not $Token) {
  throw "Provide a Cloudflare tunnel token with -Token, CLOUDFLARED_TOKEN, or cloudflare-token.txt."
}

& "$PSScriptRoot\start-local-server.ps1"

$candidates = @(
  (Join-Path $root ".local-tools\cloudflared.exe"),
  (Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Packages\Cloudflare.cloudflared_Microsoft.Winget.Source_8wekyb3d8bbwe\cloudflared.exe"),
  "cloudflared"
)

$cloudflared = $candidates | Where-Object {
  if ($_ -eq "cloudflared") {
    Get-Command cloudflared -ErrorAction SilentlyContinue
  } else {
    Test-Path $_
  }
} | Select-Object -First 1

if (-not $cloudflared) {
  throw "cloudflared was not found. Install it from Cloudflare docs or run winget install --id Cloudflare.cloudflared -e."
}

Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
Write-Host "Starting Cloudflare remotely-managed tunnel..."
& $cloudflared tunnel --no-autoupdate run --token $Token
