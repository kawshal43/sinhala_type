param(
  [string]$SourceRoot = "",
  [switch]$NoUI
)

$ErrorActionPreference = "Stop"
$releaseVersion = "1.3.1"
$script:useUI = -not $NoUI -and [Environment]::UserInteractive

if ($script:useUI) {
  Add-Type -AssemblyName System.Windows.Forms
  [Windows.Forms.Application]::EnableVisualStyles()
}

function Show-InstallerMessage {
  param(
    [string]$Text,
    [Windows.Forms.MessageBoxIcon]$Icon = [Windows.Forms.MessageBoxIcon]::Information
  )
  if ($script:useUI) {
    [Windows.Forms.MessageBox]::Show(
      $Text,
      "SinhalaType $releaseVersion Installer",
      [Windows.Forms.MessageBoxButtons]::OK,
      $Icon
    ) | Out-Null
  } else {
    Write-Host $Text
  }
}

function Stop-WithInstallerError {
  param([string]$Text)
  throw $Text
}

try {
  if ($script:useUI) {
    $welcome = [Windows.Forms.MessageBox]::Show(
      "Welcome to SinhalaType $releaseVersion.`n`nBefore installation:`n1. Save your Premiere Pro project.`n2. Close Adobe Premiere Pro.`n3. Click OK to continue.`n`nThe panel will be installed for the current Windows account.",
      "SinhalaType Installer",
      [Windows.Forms.MessageBoxButtons]::OKCancel,
      [Windows.Forms.MessageBoxIcon]::Information
    )
    if ($welcome -ne [Windows.Forms.DialogResult]::OK) { exit 0 }
  }

  while (Get-Process -Name "Adobe Premiere Pro" -ErrorAction SilentlyContinue) {
    if (-not $script:useUI) {
      throw "Close Premiere Pro before installing SinhalaType so its CEP cache can be replaced."
    }
    $retry = [Windows.Forms.MessageBox]::Show(
      "Adobe Premiere Pro is still running.`n`nSave your project, close Premiere Pro, and then click Retry.",
      "Close Premiere Pro",
      [Windows.Forms.MessageBoxButtons]::RetryCancel,
      [Windows.Forms.MessageBoxIcon]::Warning
    )
    if ($retry -ne [Windows.Forms.DialogResult]::Retry) { exit 0 }
  }

  if (-not $SourceRoot) {
    $repositorySource = Join-Path (Split-Path $PSScriptRoot -Parent) "cep\SinhalaType"
    $releaseSource = Join-Path $PSScriptRoot "SinhalaType"
    if (Test-Path -LiteralPath (Join-Path $repositorySource "CSXS\manifest.xml")) {
      $SourceRoot = $repositorySource
    } elseif (Test-Path -LiteralPath (Join-Path $releaseSource "CSXS\manifest.xml")) {
      $SourceRoot = $releaseSource
    }
  }

  if (-not $SourceRoot -or -not (Test-Path -LiteralPath (Join-Path $SourceRoot "CSXS\manifest.xml"))) {
    Stop-WithInstallerError "The SinhalaType panel folder was not found. Extract the complete ZIP and keep the installer beside the SinhalaType folder."
  }

  $cepExtensionsRoot = Join-Path ([Environment]::GetFolderPath("ApplicationData")) "Adobe\CEP\extensions"
  $destinationRoot = Join-Path $cepExtensionsRoot "SinhalaType"
  $extensionsFullPath = [IO.Path]::GetFullPath($cepExtensionsRoot).TrimEnd([IO.Path]::DirectorySeparatorChar)
  $destinationFullPath = [IO.Path]::GetFullPath($destinationRoot)
  $allowedPrefix = $extensionsFullPath + [IO.Path]::DirectorySeparatorChar

  if (-not $destinationFullPath.StartsWith($allowedPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    Stop-WithInstallerError "The calculated installation location is unsafe. Installation was stopped."
  }

  New-Item -ItemType Directory -Path $cepExtensionsRoot -Force | Out-Null
  if (Test-Path -LiteralPath $destinationFullPath) {
    Remove-Item -LiteralPath $destinationFullPath -Recurse -Force
  }
  Copy-Item -LiteralPath ([IO.Path]::GetFullPath($SourceRoot)) -Destination $destinationFullPath -Recurse -Force

  foreach ($csxsVersion in @("11", "12")) {
    $registryPath = "HKCU:\Software\Adobe\CSXS.$csxsVersion"
    New-Item -Path $registryPath -Force | Out-Null
    New-ItemProperty -Path $registryPath -Name "PlayerDebugMode" -Value "1" -PropertyType String -Force | Out-Null
  }

  $installedIndex = Join-Path $destinationFullPath "dist\index.html"
  $indexContent = Get-Content -LiteralPath $installedIndex -Raw
  $assetMatch = [regex]::Match($indexContent, 'src="\.\/(assets\/[^\"]+\.js)"')
  if (-not $assetMatch.Success) {
    Stop-WithInstallerError "The installed panel does not reference its compiled JavaScript bundle."
  }
  $installedAsset = Join-Path (Join-Path $destinationFullPath "dist") ($assetMatch.Groups[1].Value.Replace("/", "\"))
  if (-not (Test-Path -LiteralPath $installedAsset)) {
    Stop-WithInstallerError "The installed panel JavaScript bundle is missing."
  }

  $tempPath = [Environment]::GetEnvironmentVariable("TEMP")
  if ($tempPath) {
    $cepCacheRoot = Join-Path ([IO.Path]::GetFullPath($tempPath)) "cep_cache"
    if (Test-Path -LiteralPath $cepCacheRoot) {
      $cacheRootFullPath = [IO.Path]::GetFullPath($cepCacheRoot).TrimEnd([IO.Path]::DirectorySeparatorChar)
      $cachePrefix = $cacheRootFullPath + [IO.Path]::DirectorySeparatorChar
      $panelCaches = Get-ChildItem -LiteralPath $cepCacheRoot -Directory -Filter "PPRO_*_com.sinhalatype.premiere.cep.panel" -ErrorAction SilentlyContinue
      foreach ($panelCache in $panelCaches) {
        $panelCacheFullPath = [IO.Path]::GetFullPath($panelCache.FullName)
        if ($panelCacheFullPath.StartsWith($cachePrefix, [StringComparison]::OrdinalIgnoreCase)) {
          Remove-Item -LiteralPath $panelCacheFullPath -Recurse -Force
        }
      }
    }
  }

  Show-InstallerMessage "SinhalaType $releaseVersion was installed successfully.`n`nNext steps:`n1. Start Premiere Pro.`n2. Open Window > Extensions (Legacy) > SinhalaType CEP."
} catch {
  if ($script:useUI) {
    Show-InstallerMessage -Text ("Installation failed.`n`n" + $_.Exception.Message) -Icon ([Windows.Forms.MessageBoxIcon]::Error)
    exit 1
  }
  throw
}
