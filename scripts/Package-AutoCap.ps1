$ErrorActionPreference = "Stop"

$repositoryRoot = Split-Path $PSScriptRoot -Parent
$sourceRoot = Join-Path $repositoryRoot "cep\AutoCap"
$releaseRoot = Join-Path $repositoryRoot "release"
$releaseVersion = "1.3.1"
$stageRoot = Join-Path $releaseRoot "AutoCap-$releaseVersion"
$zipPath = Join-Path $releaseRoot "AutoCap-$releaseVersion.zip"

$releaseFullPath = [IO.Path]::GetFullPath($releaseRoot).TrimEnd([IO.Path]::DirectorySeparatorChar)
$stageFullPath = [IO.Path]::GetFullPath($stageRoot)
if (-not $stageFullPath.StartsWith($releaseFullPath + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to stage outside the release directory."
}

New-Item -ItemType Directory -Path $releaseRoot -Force | Out-Null
if (Test-Path -LiteralPath $stageRoot) { Remove-Item -LiteralPath $stageRoot -Recurse -Force }
if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
New-Item -ItemType Directory -Path $stageRoot | Out-Null

# 1. Compile Standalone Windows .exe Installer first
$buildExeScript = Join-Path $PSScriptRoot "Build-InstallerExe.ps1"
if (Test-Path $buildExeScript) {
  & powershell -NoProfile -ExecutionPolicy Bypass -File $buildExeScript
  $exePath = Join-Path $releaseRoot "AutoCap-Installer.exe"
  if (Test-Path $exePath) {
    Copy-Item -LiteralPath $exePath -Destination (Join-Path $stageRoot "AutoCap-Installer.exe") -Force
  }
}

# 2. Stage distribution folder
Copy-Item -LiteralPath $sourceRoot -Destination (Join-Path $stageRoot "AutoCap") -Recurse -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "Install-AutoCap.ps1") -Destination $stageRoot -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "Install-AutoCap-Windows.cmd") -Destination $stageRoot -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "Install-AutoCap-Mac.command") -Destination $stageRoot -Force
Copy-Item -LiteralPath (Join-Path $repositoryRoot "MAC-INSTALL-HELP.txt") -Destination $stageRoot -Force
Copy-Item -LiteralPath (Join-Path $repositoryRoot "DELIVERY.md") -Destination $stageRoot -Force
Copy-Item -LiteralPath (Join-Path $repositoryRoot "THIRD-PARTY-NOTICES.md") -Destination $stageRoot -Force

# 3. Build the ZIP directly so the macOS .command launcher retains Unix mode 0755.
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zipStream = [IO.File]::Open($zipPath, [IO.FileMode]::CreateNew)
try {
  $archive = New-Object IO.Compression.ZipArchive($zipStream, [IO.Compression.ZipArchiveMode]::Create, $false)
  try {
    $stagePrefixLength = $stageFullPath.TrimEnd([IO.Path]::DirectorySeparatorChar).Length + 1
    foreach ($file in Get-ChildItem -LiteralPath $stageFullPath -File -Recurse) {
      $entryName = $file.FullName.Substring($stagePrefixLength).Replace("\", "/")
      $entry = $archive.CreateEntry($entryName, [IO.Compression.CompressionLevel]::Optimal)
      if ($entryName.EndsWith(".command", [StringComparison]::OrdinalIgnoreCase)) {
        $entry.ExternalAttributes = -2115174400
      } else {
        $entry.ExternalAttributes = -2119958528
      }
      $entry.LastWriteTime = $file.LastWriteTime
      $source = [IO.File]::OpenRead($file.FullName)
      $target = $entry.Open()
      try { $source.CopyTo($target) }
      finally { $target.Dispose(); $source.Dispose() }
    }
  } finally {
    $archive.Dispose()
  }
} finally {
  $zipStream.Dispose()
}

$zipBytes = [IO.File]::ReadAllBytes($zipPath)
$eocdOffset = -1
$minimumEocdOffset = [Math]::Max(0, $zipBytes.Length - 65557)
for ($index = $zipBytes.Length - 22; $index -ge $minimumEocdOffset; $index--) {
  if ($zipBytes[$index] -eq 0x50 -and $zipBytes[$index + 1] -eq 0x4B -and $zipBytes[$index + 2] -eq 0x05 -and $zipBytes[$index + 3] -eq 0x06) {
    $eocdOffset = $index
    break
  }
}
if ($eocdOffset -lt 0) { throw "The generated ZIP end-of-central-directory record is missing." }

$entryCount = [BitConverter]::ToUInt16($zipBytes, $eocdOffset + 10)
$centralOffset = [int][BitConverter]::ToUInt32($zipBytes, $eocdOffset + 16)
for ($entryIndex = 0; $entryIndex -lt $entryCount; $entryIndex++) {
  if ($zipBytes[$centralOffset] -ne 0x50 -or $zipBytes[$centralOffset + 1] -ne 0x4B -or $zipBytes[$centralOffset + 2] -ne 0x01 -or $zipBytes[$centralOffset + 3] -ne 0x02) {
    throw "The generated ZIP central directory is invalid."
  }
  $zipBytes[$centralOffset + 5] = 3
  $nameLength = [BitConverter]::ToUInt16($zipBytes, $centralOffset + 28)
  $extraLength = [BitConverter]::ToUInt16($zipBytes, $centralOffset + 30)
  $commentLength = [BitConverter]::ToUInt16($zipBytes, $centralOffset + 32)
  $centralOffset += 46 + $nameLength + $extraLength + $commentLength
}
[IO.File]::WriteAllBytes($zipPath, $zipBytes)
Write-Host "Created $zipPath" -ForegroundColor Green

# 4. Build ZXP Archive for Adobe Extension Manager
$zxpPath = Join-Path $releaseRoot "AutoCap-$releaseVersion.zxp"
if (Test-Path $zxpPath) { Remove-Item $zxpPath -Force }
[System.IO.Compression.ZipFile]::CreateFromDirectory($sourceRoot, $zxpPath)
Write-Host "Created $zxpPath" -ForegroundColor Green
