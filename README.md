# AutoCap

AutoCap is an AI-powered Auto Captioning and Sinhala text-engineering extension for Adobe Premiere Pro on Windows and macOS. Automatically generate accurate Sinhala & English subtitles from audio or video using modern AI models (Groq Whisper, OpenAI Whisper, Google Gemini), format and edit subtitle cards, and convert them seamlessly between Unicode, Wije, or ISI font encodings for instant use on your Premiere Pro timeline.

AutoCap also includes a built-in Sinhala Typer with dictionary-first Singlish transliteration, SLS Wijesekara on-screen keyboard, and legacy font conversions.

## Features

- **AI Auto Captioning**: Instant speech-to-text subtitle generation for Sinhala, English, and multilingual audio using Groq Whisper, OpenAI Whisper, or Google Gemini.
- **Premiere Pro Integration**: One-click import directly into the active Premiere Pro project bin (`app.project.importFiles`), ready to drag onto caption tracks.
- **Triple Font Encoding for Subtitles**: Instant toggle between modern **Unicode**, **Wije font** (DL-Manel), and **ISI font** (FM-Abhaya) encodings.
- **Smart Subtitle Editor**: Live timing edits, play/preview audio segments, split/merge lines, global time shifting (+/- 0.5s), and auto-split by CPL (Characters Per Line) for Shorts/Reels.
- **Microphone Recording**: Record voiceover audio directly inside the panel to generate captions on the fly.
- **Subtitle Export**: Standard `.srt` (SubRip), `.vtt` (WebVTT), and clipboard copy.
- **Sinhala Typer**: Dictionary-first Singlish conversion, on-screen Easy Phonetic and Wijesekara keyboards, typing hints, and English text protection (`{Braces}`).

## Development

```powershell
npm install
npm test
npm run build
```

- `npm run install:cep` builds and opens the guided Windows installer for the current user.
- `npm run package:cep` creates `release/AutoCap-1.3.1.zip` with Windows and macOS installers.

After installation, restart Premiere Pro and open **Window > Extensions (Legacy) > AutoCap CEP**.

## Installation

1. Download or extract `AutoCap-1.3.1.zip`.
2. On Windows, run `Install-AutoCap-Windows.cmd`.
3. On macOS, run `Install-AutoCap-Mac.command`.
4. Restart Adobe Premiere Pro.
5. Open **Window > Extensions (Legacy) > AutoCap CEP**.

## Use

### Auto Caption
1. Drop your audio or video file into the Auto Caption drop zone, or record with your microphone.
2. Select your language and AI engine.
3. Click **Generate Auto Captions**.
4. Click **Import to Premiere** to add the subtitles to your project bin, or export as `.srt`.

### Sinhala Typer
1. Switch to **Sinhala Typer**.
2. Type Singlish in the upper field or open the on-screen keyboard.
3. Select **Unicode**, **Wije font**, or **ISI font**.
4. Click **Copy** and paste into Premiere Pro.
