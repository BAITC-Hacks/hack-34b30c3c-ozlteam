# Запуск проекта в Docker на Windows (PowerShell).
# Эквивалент scripts/dev.sh: всегда выбирает локальный .env.local репозитория.
#   .\scripts\dev.ps1 up --build -d
#   .\scripts\dev.ps1 logs -f
$ErrorActionPreference = 'Stop'

$ProjectDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $ProjectDir

$EnvFile = Join-Path $ProjectDir '.env.local'
if (-not (Test-Path $EnvFile)) {
    # Без JWT-секрета авторизация не стартует, поэтому генерируем его здесь.
    $bytes = [byte[]]::new(32)
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    $secret = ($bytes | ForEach-Object { $_.ToString('x2') }) -join ''
    (Get-Content (Join-Path $ProjectDir '.env.local.example')) `
        -replace '^SECURITY_JWT_SECRET=$', "SECURITY_JWT_SECRET=$secret" |
        Set-Content $EnvFile
    Write-Host 'Created .env.local from .env.local.example (JWT secret generated)'
}

& docker compose --project-directory $ProjectDir `
    --env-file $EnvFile -f (Join-Path $ProjectDir 'compose.yaml') @args
exit $LASTEXITCODE
