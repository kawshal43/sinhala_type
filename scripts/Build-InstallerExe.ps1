$ErrorActionPreference = "Stop"

$repoRoot = "H:\2026\sinhala_type\sinhala_type"
$csc = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
$outExe = Join-Path $repoRoot "release\AutoCap-Installer.exe"
$sourceDir = Join-Path $repoRoot "cep\AutoCap"
$tempZip = Join-Path $env:TEMP "AutoCap_payload.zip"

if (Test-Path $tempZip) { Remove-Item $tempZip -Force }

Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($sourceDir, $tempZip)

$csSource = @"
using System;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Windows.Forms;
using Microsoft.Win32;

namespace AutoCapSetup
{
    class Program
    {
        [STAThread]
        static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            DialogResult result = MessageBox.Show(
                "Welcome to AutoCap 1.3.1 Setup!\n\n" +
                "This will install the AutoCap subtitle & translation extension for Adobe Premiere Pro.\n\n" +
                "Click OK to install.",
                "AutoCap 1.3.1 Setup",
                MessageBoxButtons.OKCancel,
                MessageBoxIcon.Information);

            if (result != DialogResult.OK) return;

            try
            {
                string appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
                string cepPath = Path.Combine(appData, @"Adobe\CEP\extensions\AutoCap");

                if (!Directory.Exists(Path.GetDirectoryName(cepPath)))
                {
                    Directory.CreateDirectory(Path.GetDirectoryName(cepPath));
                }

                if (Directory.Exists(cepPath))
                {
                    try { Directory.Delete(cepPath, true); } catch { }
                }
                Directory.CreateDirectory(cepPath);

                Assembly assembly = Assembly.GetExecutingAssembly();
                using (Stream stream = assembly.GetManifestResourceStream("AutoCap_payload.zip"))
                {
                    if (stream == null) throw new Exception("Embedded extension payload not found.");
                    using (ZipArchive archive = new ZipArchive(stream))
                    {
                        foreach (ZipArchiveEntry entry in archive.Entries)
                        {
                            string destinationPath = Path.GetFullPath(Path.Combine(cepPath, entry.FullName));
                            if (string.IsNullOrEmpty(entry.Name))
                            {
                                Directory.CreateDirectory(destinationPath);
                            }
                            else
                            {
                                Directory.CreateDirectory(Path.GetDirectoryName(destinationPath));
                                entry.ExtractToFile(destinationPath, true);
                            }
                        }
                    }
                }

                for (int v = 9; v <= 16; v++)
                {
                    try
                    {
                        using (RegistryKey key = Registry.CurrentUser.CreateSubKey(@"Software\Adobe\CSXS." + v))
                        {
                            if (key != null) key.SetValue("PlayerDebugMode", "1", RegistryValueKind.String);
                        }
                    }
                    catch { }
                }

                try
                {
                    string temp = Path.GetTempPath();
                    string cacheDir = Path.Combine(temp, "cep_cache");
                    if (Directory.Exists(cacheDir))
                    {
                        foreach (string dir in Directory.GetDirectories(cacheDir, "PPRO_*_com.autocap.premiere.cep.panel"))
                        {
                            try { Directory.Delete(dir, true); } catch { }
                        }
                    }
                }
                catch { }

                MessageBox.Show(
                    "AutoCap 1.3.1 was installed successfully!\n\n" +
                    "To open in Adobe Premiere Pro:\n" +
                    "Window > Extensions (Legacy) > AutoCap CEP\n\n" +
                    "Enjoy automatic captions & Sinhala tools!",
                    "AutoCap Setup - Success",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    "Installation failed: " + ex.Message,
                    "AutoCap Setup Error",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
            }
        }
    }
}
"@

$csFile = Join-Path $env:TEMP "AutoCapSetup.cs"
Set-Content -LiteralPath $csFile -Value $csSource -Encoding UTF8

$compileArgs = @(
    "/target:winexe",
    "/optimize+",
    "/platform:anycpu",
    "/out:$outExe",
    "/reference:System.dll",
    "/reference:System.Windows.Forms.dll",
    "/reference:System.IO.Compression.dll",
    "/reference:System.IO.Compression.FileSystem.dll",
    "/resource:$tempZip,AutoCap_payload.zip",
    $csFile
)

& $csc $compileArgs

if (Test-Path $outExe) {
    Write-Host "Successfully compiled standalone installer: $outExe" -ForegroundColor Green
} else {
    throw "Compilation failed."
}
