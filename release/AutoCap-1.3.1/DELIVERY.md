# AutoCap 1.3.1 for Premiere Pro

## Windows installation

1. Close Premiere Pro and extract all files from `AutoCap-1.3.1.zip`.
2. Double-click `Install-AutoCap-Windows.cmd`.
3. Follow the installer dialogs. If Premiere is open, the installer waits while you save and close it.
4. Start Premiere Pro.
5. Open **Window > Extensions (Legacy) > AutoCap CEP**.

The Windows installer installs the panel for the current user, enables unsigned CEP loading, verifies the compiled panel, and clears AutoCap's Premiere CEP cache.

## macOS installation

1. Close Premiere Pro and extract all files from `AutoCap-1.3.1.zip`.
2. Double-click `Install-AutoCap-Mac.command`.
3. Follow the native macOS dialogs. If Premiere is open, the installer waits while you save and close it.
4. Start Premiere Pro.
5. Open **Window > Extensions (Legacy) > AutoCap CEP**.

If macOS blocks the unsigned installer, Control-click `Install-AutoCap-Mac.command`, choose **Open**, and confirm **Open**. The installer uses no administrator password because it installs into the current user's CEP extensions folder.

If macOS reports that you do not have appropriate access privileges, open Terminal, type `bash` followed by one space, drag `Install-AutoCap-Mac.command` into Terminal, and press Return. The same instructions are included in `MAC-INSTALL-HELP.txt`.

The macOS installer installs the panel in `~/Library/Application Support/Adobe/CEP/extensions`, enables `PlayerDebugMode` for CSXS 11 and 12, verifies the compiled panel, and clears AutoCap's Premiere CEP cache.

## Use

### 1. Auto Caption (New)
1. Drag and drop any audio or video file (`.mp3`, `.wav`, `.m4a`, `.mp4`, `.webm`) into the drop zone, or click **Record Mic** to record directly.
2. Select your language (**Sinhala**, **English**, or **Auto-Detect**) and AI Engine (**Groq Whisper**, **OpenAI Whisper**, or **Gemini 2.5 Flash**).
3. Click **Generate Auto Captions**.
4. In the Captions Editor:
   - Edit any subtitle line or timestamps directly.
   - Choose your target font encoding: **Unicode**, **Wije font**, or **ISI font**.
   - Click **Import to Premiere** to automatically add the subtitle file directly to your active Premiere Pro project bin!
   - Or click **Export .SRT**, **Export .VTT**, or **Copy SRT**.

### 2. Sinhala Typer
1. Switch to the **Sinhala Typer** tab.
2. Type Singlish in the upper field or click **Paste**.
3. Optionally open **Keyboard** and choose **Easy Phonetic** or **Wijesekara (SLS)**.
4. Choose **Unicode**, **Wije font**, or **ISI font**.
5. Click **Copy** and paste into Premiere Pro.

### 3. Settings
1. Switch to the **Settings** tab.
2. Add your Groq, OpenAI, or Gemini API keys (keys are stored locally on your machine).
3. Configure your preferred characters-per-line (CPL) for auto-splitting long sentences.

