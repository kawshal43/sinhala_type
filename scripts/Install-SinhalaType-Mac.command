#!/bin/bash
set -euo pipefail

VERSION="1.3.1"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
SOURCE_ROOT="$SCRIPT_DIR/SinhalaType"
EXTENSIONS_ROOT="$HOME/Library/Application Support/Adobe/CEP/extensions"
DESTINATION="$EXTENSIONS_ROOT/SinhalaType"

show_message() {
  /usr/bin/osascript - "$1" "$2" <<'APPLESCRIPT'
on run argv
  display dialog (item 1 of argv) with title (item 2 of argv) buttons {"OK"} default button "OK"
end run
APPLESCRIPT
}

show_error() {
  /usr/bin/osascript - "$1" "SinhalaType Installer" <<'APPLESCRIPT'
on run argv
  display alert (item 2 of argv) message (item 1 of argv) as critical buttons {"OK"} default button "OK"
end run
APPLESCRIPT
}

fail() {
  show_error "$1"
  exit 1
}

WELCOME=$(/usr/bin/osascript <<APPLESCRIPT
button returned of (display dialog "Welcome to SinhalaType $VERSION.\n\nBefore installation:\n1. Save your Premiere Pro project.\n2. Close Adobe Premiere Pro.\n3. Click Install to continue.\n\nThe panel will be installed for the current macOS account." with title "SinhalaType Installer" buttons {"Cancel", "Install"} default button "Install" cancel button "Cancel")
APPLESCRIPT
) || exit 0
[ "$WELCOME" = "Install" ] || exit 0

while /usr/bin/pgrep -x "Adobe Premiere Pro" >/dev/null 2>&1; do
  ACTION=$(/usr/bin/osascript <<'APPLESCRIPT'
button returned of (display dialog "Adobe Premiere Pro is still running.\n\nSave your project, close Premiere Pro, and then click Check Again." with title "Close Premiere Pro" buttons {"Cancel", "Check Again"} default button "Check Again" cancel button "Cancel" with icon caution)
APPLESCRIPT
  ) || exit 0
  [ "$ACTION" = "Check Again" ] || exit 0
done

[ -f "$SOURCE_ROOT/CSXS/manifest.xml" ] || fail "The SinhalaType panel folder was not found. Extract the complete ZIP and keep this installer beside the SinhalaType folder."

case "$DESTINATION" in
  "$EXTENSIONS_ROOT"/*) ;;
  *) fail "The calculated installation location is unsafe. Installation was stopped." ;;
esac

/bin/mkdir -p "$EXTENSIONS_ROOT"
if [ -e "$DESTINATION" ]; then
  /bin/rm -rf -- "$DESTINATION"
fi
/usr/bin/ditto "$SOURCE_ROOT" "$DESTINATION"

/usr/bin/defaults write com.adobe.CSXS.11 PlayerDebugMode -string 1
/usr/bin/defaults write com.adobe.CSXS.12 PlayerDebugMode -string 1

[ -f "$DESTINATION/dist/index.html" ] || fail "The installed panel index is missing."
COMPILED_ASSET=$(/usr/bin/find "$DESTINATION/dist/assets" -maxdepth 1 -type f -name 'index-*.js' -print -quit 2>/dev/null || true)
[ -n "$COMPILED_ASSET" ] || fail "The installed panel JavaScript bundle is missing."

CACHE_ROOT="$HOME/Library/Caches/CSXS/cep_cache"
if [ -d "$CACHE_ROOT" ]; then
  for CACHE_PATH in "$CACHE_ROOT"/PPRO_*_com.sinhalatype.premiere.cep.panel; do
    [ -d "$CACHE_PATH" ] || continue
    case "$CACHE_PATH" in
      "$CACHE_ROOT"/PPRO_*_com.sinhalatype.premiere.cep.panel) /bin/rm -rf -- "$CACHE_PATH" ;;
    esac
  done
fi

show_message "SinhalaType $VERSION was installed successfully.\n\nNext steps:\n1. Start Premiere Pro.\n2. Open Window > Extensions (Legacy) > SinhalaType CEP." "SinhalaType Installer"
