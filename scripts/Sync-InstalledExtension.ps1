$ErrorActionPreference = "Stop"
$appData = [Environment]::GetFolderPath("ApplicationData")
$cepExtensions = Join-Path $appData "Adobe\CEP\extensions"
$destination = Join-Path $cepExtensions "AutoCap"
$source = "H:\2026\sinhala_type\sinhala_type\cep\AutoCap"

New-Item -ItemType Directory -Path $cepExtensions -Force | Out-Null

Copy-Item -Path "$source\*" -Destination $destination -Recurse -Force

$tempPath = [Environment]::GetEnvironmentVariable("TEMP")
if ($tempPath) {
    $cepCacheRoot = Join-Path $tempPath "cep_cache"
    if (Test-Path -LiteralPath $cepCacheRoot) {
        $panelCaches = Get-ChildItem -LiteralPath $cepCacheRoot -Directory -Filter "PPRO_*_com.autocap.premiere.cep.panel" -ErrorAction SilentlyContinue
        foreach ($c in $panelCaches) {
            Remove-Item -LiteralPath $c.FullName -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

Write-Host "AutoCap successfully synced to $destination and cache cleared." -ForegroundColor Green

