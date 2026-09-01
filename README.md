# SinhalaType

SinhalaType is a free, offline Sinhala typing and text-conversion extension for Adobe Premiere Pro on Windows and macOS. Write naturally in Singlish—or use the built-in Sinhala keyboard—and instantly convert your text to Unicode, Wije, or ISI/Isiwara for use in your video projects.

<p align="center">
  <a href="https://github.com/kawshal43/sinhala_unicord_translater/raw/refs/heads/main/release/SinhalaType-1.0.f.zip">
    <img src="https://img.shields.io/badge/Download-SinhalaType--1.0.f.zip-2ea44f?style=for-the-badge&logo=github" alt="Download SinhalaType 1.0.f">
  </a>
</p>

The download includes guided installers for both Windows and macOS. SinhalaType runs locally, so your text stays on your computer and no internet connection is required for conversion.

## Features

- Dictionary-first Singlish conversion with case-sensitive phonetic fallback
- Complete on-screen coverage of all 59 assigned Sinhala vowels and consonants
- Easy Phonetic and Wijesekara (SLS) keyboard layouts
- Inline typing hints
- Unicode, Wije 6, and ISI/Isiwara clipboard output
- Local, offline conversion

## Development

```powershell
npm install
npm test
npm run build
```

- `npm run install:cep` builds and opens the guided Windows installer for the current user.
- `npm run package:cep` creates `release/SinhalaType-1.3.1.zip` with Windows and macOS installers.

After installation, restart Premiere Pro and open **Window > Extensions (Legacy) > SinhalaType CEP**.

## Installation

1. Click the **Download** button above and extract `SinhalaType-1.0.f.zip`.
2. On Windows, run `Install-SinhalaType-Windows.cmd`.
3. On macOS, run `Install-SinhalaType-Mac.command`.
4. Restart Adobe Premiere Pro.
5. Open **Window > Extensions (Legacy) > SinhalaType CEP**.

## Use

1. Type Singlish in the upper field, paste text, or open **Keyboard**.
2. Select **Unicode**, **Wije font**, or **ISI font**.
3. Click the Copy button.
4. Paste the result into Premiere.

Unicode is recommended for modern Premiere text. Wije and ISI are legacy encodings; apply the matching legacy font after pasting.

Use braces to preserve English text:

```ts
transliterate("mama {Premiere Pro} use karanawa");
```
