# Deploy WIRA Kuliner ke Vercel (setelah: npx vercel login)
# Usage: .\scripts\deploy-vercel.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "=== WIRA Kuliner - Deploy Vercel ===" -ForegroundColor Cyan

$whoami = npx vercel whoami 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host "Belum login Vercel. Jalankan: npx vercel login" -ForegroundColor Yellow
  exit 1
}
Write-Host "Login sebagai: $whoami" -ForegroundColor Green

$envFile = Join-Path $root ".env.local"
if (-not (Test-Path $envFile)) {
  Write-Host "File .env.local tidak ditemukan." -ForegroundColor Red
  exit 1
}

function Get-EnvValue($name) {
  Get-Content $envFile | ForEach-Object {
    if ($_ -match "^\s*$name=(.+)$") { return $matches[1].Trim() }
  }
  return $null
}

$vars = @(
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY"
)

Write-Host "Link project wirakuliner2..." -ForegroundColor Cyan
if (-not (Test-Path ".vercel\project.json")) {
  npx vercel link --yes --project=wirakuliner2 2>&1
}

Write-Host "Set environment variables..." -ForegroundColor Cyan
foreach ($name in $vars) {
  $val = Get-EnvValue $name
  if (-not $val) {
    Write-Host "  SKIP $name" -ForegroundColor Yellow
    continue
  }
  foreach ($target in @("production", "preview", "development")) {
    $val | npx vercel env add $name $target --force 2>&1 | Out-Null
  }
  Write-Host "  OK $name" -ForegroundColor Green
}

Write-Host "Deploy production..." -ForegroundColor Cyan
npx vercel --prod --yes 2>&1

if ($LASTEXITCODE -eq 0) {
  Write-Host ""
  Write-Host "Deploy selesai: https://vercel.com/dashboard" -ForegroundColor Green
  Write-Host "Set Supabase Auth URL ke domain Vercel." -ForegroundColor Yellow
}
