param(
  [string]$SourceRoot = "",
  [switch]$NoUI
)

$ErrorActionPreference = "Stop"
$releaseVersion = "1.3.1"
$script:useUI = -not $NoUI -and [Environment]::UserInteractive

function Show-InstallerMessage {
  param(
    [string]$Text,
    [string]$Title = "AutoCap $releaseVersion Installer",
    [string]$Icon = "Information"
  )
  if ($script:useUI) {
    try {
      Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue
      [System.Windows.Forms.Application]::EnableVisualStyles()
      [System.Windows.Forms.MessageBox]::Show($Text, $Title, [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::$Icon) | Out-Null
    } catch {
      Write-Host $Text
    }
  } else {
    Write-Host $Text
  }
}

try {
  Write-Host "Installing AutoCap $releaseVersion for Adobe Premiere Pro..." -ForegroundColor Cyan

  $premiereRunning = Get-Process -Name "Adobe Premiere Pro" -ErrorAction SilentlyContinue

  # 1. Locate Source AutoCap Folder
  if (-not $SourceRoot) {
    $candidates = @(
      (Join-Path $PSScriptRoot "AutoCap"),
      (Join-Path (Split-Path $PSScriptRoot -Parent) "cep\AutoCap"),
      (Join-Path $PSScriptRoot "cep\AutoCap"),
      "H:\2026\sinhala_type\sinhala_type\cep\AutoCap"
    )
    foreach ($cand in $candidates) {
      if (Test-Path -LiteralPath (Join-Path $cand "CSXS\manifest.xml")) {
        $SourceRoot = $cand
        break
      }
    }
  }

  if (-not $SourceRoot -or -not (Test-Path -LiteralPath (Join-Path $SourceRoot "CSXS\manifest.xml"))) {
    throw "The AutoCap extension folder was not found. Please ensure the AutoCap folder is located beside the installer."
  }

  # 2. Destination in Adobe CEP extensions
  $cepExtensionsRoot = Join-Path ([Environment]::GetFolderPath("ApplicationData")) "Adobe\CEP\extensions"
  $destinationRoot = Join-Path $cepExtensionsRoot "AutoCap"

  New-Item -ItemType Directory -Path $destinationRoot -Force | Out-Null

  # 3. Copy files to destination
  Copy-Item -Path "$SourceRoot\*" -Destination $destinationRoot -Recurse -Force
  Write-Host "[OK] Extension files installed to: $destinationRoot" -ForegroundColor Green

  # 4. Enable PlayerDebugMode for all CSXS versions (allows unsigned extensions to run)
  foreach ($csxsVer in @("9", "10", "11", "12", "13", "14", "15", "16")) {
    $regPath = "HKCU:\Software\Adobe\CSXS.$csxsVer"
    New-Item -Path $regPath -Force -ErrorAction SilentlyContinue | Out-Null
    New-ItemProperty -Path $regPath -Name "PlayerDebugMode" -Value "1" -PropertyType String -Force -ErrorAction SilentlyContinue | Out-Null
  }
  Write-Host "[OK] Enabled Adobe CSXS Extension Debug Mode in Windows Registry." -ForegroundColor Green

  # 5. Clear CEP Cache for clean launch
  $tempPath = [Environment]::GetEnvironmentVariable("TEMP")
  if ($tempPath) {
    $cepCacheRoot = Join-Path $tempPath "cep_cache"
    if (Test-Path -LiteralPath $cepCacheRoot) {
      $panelCaches = Get-ChildItem -LiteralPath $cepCacheRoot -Directory -Filter "PPRO_*_com.autocap.premiere.cep.panel" -ErrorAction SilentlyContinue
      $legacyCaches = Get-ChildItem -LiteralPath $cepCacheRoot -Directory -Filter "PPRO_*_com.sinhalatype.premiere.cep.panel" -ErrorAction SilentlyContinue
      foreach ($c in ($panelCaches + $legacyCaches)) {
        Remove-Item -LiteralPath $c.FullName -Recurse -Force -ErrorAction SilentlyContinue
      }
    }
  }
  Write-Host "[OK] Cleared Premiere CEP cache." -ForegroundColor Green

  # 6. Success notification
  $successMsg = "AutoCap $releaseVersion was installed successfully!`n`n"
  if ($premiereRunning) {
    $successMsg += "Notice: Adobe Premiere Pro is currently open.`nPlease close and reopen Premiere Pro (or right-click in AutoCap panel and click Reload).`n`n"
  } else {
    $successMsg += "Open Adobe Premiere Pro and go to:`nWindow > Extensions (Legacy) > AutoCap CEP`n`n"
  }
  $successMsg += "Enjoy automated subtitles & Sinhala tools in Premiere Pro!"

  Write-Host "`n$successMsg" -ForegroundColor Green
  Show-InstallerMessage -Text $successMsg -Title "AutoCap Installed Successfully" -Icon "Information"

} catch {
  $errMsg = "Installation failed: $($_.Exception.Message)"
  Write-Host $errMsg -ForegroundColor Red
  Show-InstallerMessage -Text $errMsg -Title "AutoCap Installation Error" -Icon "Error"
  exit 1
}
