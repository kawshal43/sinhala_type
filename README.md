# AutoCap

AutoCap is an AI-powered Auto Captioning and Sinhala text-engineering extension for Adobe Premiere Pro on Windows and macOS. Automatically generate accurate Sinhala & English subtitles from audio or video using modern AI models (Groq Whisper, OpenAI Whisper, Google Gemini), format and edit subtitle cards, and convert them seamlessly between Unicode, Wije, or ISI font encodings for instant use on your Premiere Pro timeline.

AutoCap also includes a built-in Sinhala Typer with dictionary-first Singlish transliteration, SLS Wijesekara on-screen keyboard, and legacy font conversions.

## Features

- **AI Auto Captioning**: Instant speech-to-text subtitle generation for Sinhala, English, and multilingual audio using Google Gemini, Groq Whisper, or OpenAI Whisper.
- **Hybrid Desktop Architecture**: Local Media Worker companion daemon (`workerServer.ts`) on port 48128 with zero-configuration fallback to built-in VAD chunking.
- **Gemini Files API for Large Media**: Automatic resumable binary upload for audio files $\ge 4\text{ MB}$, eliminating Base64 payload bottlenecks.
- **Premiere Pro Timeline Integration**: Direct timeline placement onto caption tracks plus project bin import (`app.project.importFiles`).
- **Triple Font Encoding for Subtitles**: Instant toggle between modern **Unicode**, **Wije font** (DL-Manel), and **ISI font** (FM-Abhaya / IsiBasuru) encodings.
- **Smart Subtitle Editor**: Live timing edits, per-caption AI retry (`[🔄]`), Undo/Redo history stack, batch Find & Replace, timing overlap auto-repair, and auto-split by CPL.
- **Live Readability & Reading Speed Meter**: Real-time Characters Per Line (CPL) and Characters Per Second (CPS) metrics with visual pacing warnings.
- **Permanent Multi-Tier Storage**: Automatically persists API keys and preferences to `~/.autocap-config.json` on disk, surviving CEP cache clears and Premiere restarts.
- **Microphone Recording**: Record voiceover audio directly inside the panel to generate captions on the fly.
- **Subtitle Export**: Standard `.srt` (SubRip), `.vtt` (WebVTT), and clipboard copy.
- **Sinhala Typer**: Dictionary-first Singlish conversion, on-screen Easy Phonetic and Wijesekara keyboards, typing hints, and English text protection (`{Braces}`).

For full technical specifications and subsystem design, see [ARCHITECTURE.md](file:///d:/2026/kawshal/AutoCap/sinhala_type/ARCHITECTURE.md).

## Development

```powershell
npm install
npm test
npm run build
npm run worker     # Starts companion Local Media Worker daemon
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
