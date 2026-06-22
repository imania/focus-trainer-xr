$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

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
Remove-Item cloudflare-tunnel.log,cloudflare-tunnel.err.log,cloudflare-tunnel-url.txt -ErrorAction SilentlyContinue

$out = Join-Path $root "cloudflare-tunnel.log"
$err = Join-Path $root "cloudflare-tunnel.err.log"
$args = @("tunnel", "--no-autoupdate", "--protocol", "http2", "--edge-ip-version", "4", "--url", "http://localhost:8080")

Write-Host "Starting Cloudflare quick tunnel..."
$process = Start-Process `
  -FilePath $cloudflared `
  -ArgumentList $args `
  -WorkingDirectory $root `
  -WindowStyle Hidden `
  -RedirectStandardOutput $out `
  -RedirectStandardError $err `
  -PassThru

for ($i = 0; $i -lt 45; $i++) {
  Start-Sleep -Seconds 1
  $log = ""
  if (Test-Path $out) { $log += Get-Content -Raw $out -ErrorAction SilentlyContinue }
  if (Test-Path $err) { $log += "`n" + (Get-Content -Raw $err -ErrorAction SilentlyContinue) }
  $url = [regex]::Match($log, "https://[-a-zA-Z0-9]+\.trycloudflare\.com").Value
  if ($url) {
    Set-Content -Path (Join-Path $root "cloudflare-tunnel-url.txt") -Value $url
    Write-Host "Quest URL: $url"
    Write-Host "Keep this PowerShell session or cloudflared process running while testing."
    exit 0
  }
  if ($process.HasExited) {
    throw "cloudflared exited before producing a URL. Check cloudflare-tunnel.log and cloudflare-tunnel.err.log."
  }
}

Write-Host "No URL appeared yet. Process id: $($process.Id)"
Write-Host "Check cloudflare-tunnel.log and cloudflare-tunnel.err.log."
