@echo off
title AutoCap 1.3.1 Installer for Adobe Premiere Pro
echo ========================================================
echo   AutoCap 1.3.1 - Premiere Pro Extension Installer
echo ========================================================
echo.
echo Installing AutoCap panel...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-AutoCap.ps1"
echo.
echo Press any key to exit...
pause >nul
