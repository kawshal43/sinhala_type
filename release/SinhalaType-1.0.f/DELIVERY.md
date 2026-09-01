# SinhalaType 1.3.1 for Premiere Pro

## Windows installation

1. Close Premiere Pro and extract all files from `SinhalaType-1.3.1.zip`.
2. Double-click `Install-SinhalaType-Windows.cmd`.
3. Follow the installer dialogs. If Premiere is open, the installer waits while you save and close it.
4. Start Premiere Pro.
5. Open **Window > Extensions (Legacy) > SinhalaType CEP**.

The Windows installer installs the panel for the current user, enables unsigned CEP loading, verifies the compiled panel, and clears only SinhalaType's Premiere CEP cache.

## macOS installation

1. Close Premiere Pro and extract all files from `SinhalaType-1.3.1.zip`.
2. Double-click `Install-SinhalaType-Mac.command`.
3. Follow the native macOS dialogs. If Premiere is open, the installer waits while you save and close it.
4. Start Premiere Pro.
5. Open **Window > Extensions (Legacy) > SinhalaType CEP**.

If macOS blocks the unsigned installer, Control-click `Install-SinhalaType-Mac.command`, choose **Open**, and confirm **Open**. The installer uses no administrator password because it installs into the current user's CEP extensions folder.

If macOS reports that you do not have appropriate access privileges, open Terminal, type `bash` followed by one space, drag `Install-SinhalaType-Mac.command` into Terminal, and press Return. This fallback does not require the executable permission. The same instructions are included in `MAC-INSTALL-HELP.txt`.

The macOS installer installs the panel in `~/Library/Application Support/Adobe/CEP/extensions`, enables `PlayerDebugMode` for CSXS 11 and 12, verifies the compiled panel, and clears only SinhalaType's Premiere CEP cache.

## Use

1. Type Singlish in the upper field or click **Paste**.
2. Optionally open **Keyboard** and choose **Easy Phonetic** or **Wijesekara (SLS)**.
3. Open **Hints** for combinations and English-text protection.
4. Choose **Unicode**, **Wije font**, or **ISI font**.
5. Click Copy and paste the result where required.

Unicode is recommended for modern Premiere text. Wije and ISI are legacy encodings and require the matching font in Premiere. The supplied Wije font can be installed with Windows Font Settings or macOS Font Book. A compatible ISI/Isiwara font must be supplied separately.

This converter-only edition does not include Live Type, Add Text Layer, Insert, MOGRT, automatic timeline updates, or custom Effect Controls. It supports Premiere Pro 26.0–26.9.

This is an unsigned internal CEP build. Public distribution requires signing and a managed installer.
