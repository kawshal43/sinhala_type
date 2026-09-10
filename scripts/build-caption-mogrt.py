"""Normalize AutoCapCaption.mogrt for editable Sinhala + English captions.

Produces a pure text caption MOGRT with zero shape/background layers,
ensuring high contrast white text with soft drop shadow and full font/size
editing in Premiere Pro Essential Graphics & Properties panel.
"""

from __future__ import annotations

import base64
import gzip
import io
import json
import re
import struct
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUTS = (
    ROOT / "assets" / "AutoCapCaption.mogrt",
    ROOT / "cep" / "AutoCap" / "assets" / "AutoCapCaption.mogrt",
)
FONT_NAME = "NotoSansSinhala-Regular"
FONT_SIZE = 64

# Base clean template search candidates
TEMPLATE_CANDIDATES = [
    Path(r"C:\Program Files\Adobe\Adobe Premiere Pro (Beta)\Essential Graphics\Captions and Subtitles\Bold Web Caption.mogrt"),
    Path(r"C:\Program Files\Adobe\Adobe Premiere Pro 2025\Essential Graphics\Captions and Subtitles\Bold Web Caption.mogrt"),
    Path(r"C:\Program Files\Adobe\Adobe Premiere Pro 2024\Essential Graphics\Captions and Subtitles\Bold Web Caption.mogrt"),
    Path(r"C:\Program Files\Adobe\Adobe Premiere Pro (Beta)\Essential Graphics\Basic Title.mogrt"),
    ROOT / "assets" / "AutoCapCaption.mogrt",
]


def resolve_source_template() -> Path:
    for cand in TEMPLATE_CANDIDATES:
        if cand.exists():
            return cand
    return ROOT / "assets" / "AutoCapCaption.mogrt"


def zip_bytes(files: list[tuple[zipfile.ZipInfo, bytes]]) -> bytes:
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w") as archive:
        for old_info, data in files:
            info = zipfile.ZipInfo(old_info.filename, old_info.date_time)
            info.compress_type = old_info.compress_type
            info.external_attr = old_info.external_attr
            info.create_system = old_info.create_system
            info.comment = old_info.comment
            archive.writestr(info, data)
    return output.getvalue()


def patch_source_text_blob(match: re.Match[str]) -> str:
    attributes, encoded = match.group(1), "".join(match.group(2).split())
    data = base64.b64decode(encoded)
    try:
        document = json.loads(data[8:].decode("utf-16le"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return match.group(0)

    text_param = document.get("mTextParam")
    if not isinstance(text_param, dict):
        return match.group(0)

    text_param["mIndic"] = True
    text_param["mLigatures"] = True
    text_param["mLeading"] = 0
    text_param["mAlignment"] = 2  # Center aligned

    # Ensure soft drop shadow for maximum legibility on any footage without needing an opaque shape box
    text_param["mShadowVisible"] = True
    text_param["mShadowOpacity"] = 85.0
    text_param["mShadowBlur"] = 20.0
    text_param["mShadowOffset"] = 4.0
    text_param["mShadowColor"] = 0

    for run in text_param.get("mDefaultRun", []):
        style = run.get("mStyleParam", {})
        style["mFontName"] = FONT_NAME
        style["mFontSize"] = FONT_SIZE
        style["mFillVisible"] = True
        style["mFillColor"] = 16777215

    style_sheet = text_param.get("mStyleSheet", {})
    style_sheet.setdefault("mFontName", {})["mParamValues"] = [[0, FONT_NAME]]
    style_sheet.setdefault("mFontSize", {})["mParamValues"] = [[0, FONT_SIZE]]
    style_sheet.setdefault("mFillColor", {})["mParamValues"] = [[0, 16777215]]
    style_sheet.setdefault("mFillVisible", {})["mParamValues"] = [[0, True]]
    style_sheet["mText"] = "Caption Text"

    payload = json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode("utf-16le")
    patched = struct.pack("<I", len(payload)) + data[4:8] + payload
    hash_match = re.search(r'BinaryHash="([^"]+)"', attributes)
    if hash_match:
        old_hash = hash_match.group(1)
        new_hash = old_hash[:-8] + f"{len(patched) + 12:08x}"
        attributes = attributes.replace(old_hash, new_hash)
    return f"<StartKeyframeValue{attributes}>{base64.b64encode(patched).decode('ascii')}\n\t\t</StartKeyframeValue>"


def patch_prgraphic(data: bytes) -> bytes:
    source = io.BytesIO(data)
    with zipfile.ZipFile(source, "r") as archive:
        files: list[tuple[zipfile.ZipInfo, bytes]] = []
        for info in archive.infolist():
            project_data = archive.read(info.filename)
            xml = gzip.decompress(project_data).decode("utf-8")
            xml = re.sub(
                r"<StartKeyframeValue([^>]*)>(.*?)\s*</StartKeyframeValue>",
                patch_source_text_blob,
                xml,
                flags=re.DOTALL,
            )
            project_data = gzip.compress(xml.encode("utf-8"), mtime=0)
            files.append((info, project_data))
    return zip_bytes(files)


def build() -> None:
    source_path = resolve_source_template()
    print(f"Building AutoCapCaption.mogrt from: {source_path}")

    with zipfile.ZipFile(source_path, "r") as archive:
        files: list[tuple[zipfile.ZipInfo, bytes]] = []
        for info in archive.infolist():
            data = archive.read(info.filename)
            if info.filename == "definition.json":
                definition = json.loads(data.decode("utf-8-sig"))
                definition["description"] = "AutoCap editable Unicode caption template for Sinhala and English"
                # Keep only text controls, completely eliminate any shape controls
                filtered_controls = []
                for control in definition.get("clientControls", []):
                    if control.get("hidden") or control.get("type") == 8:
                        continue
                    font_info = control.get("fonteditinfo")
                    if font_info is not None:
                        font_info.update(
                            capPropFontEdit=True,
                            capPropFontFauxStyleEdit=True,
                            capPropFontSizeEdit=True,
                            fontEditValue=FONT_NAME,
                            fontSizeEditValue=FONT_SIZE,
                        )
                    for localized in control.get("uiName", {}).get("strDB", []):
                        localized["str"] = "Caption Text"
                    for val in control.get("value", {}).get("strDB", []):
                        val["str"] = "Caption Text"
                    filtered_controls.append(control)
                definition["clientControls"] = filtered_controls
                for locale in definition.get("usedFontsLocalized", {}):
                    definition["usedFontsLocalized"][locale] = [FONT_NAME]
                data = json.dumps(definition, ensure_ascii=False, indent=2).encode("utf-8")
            elif info.filename.endswith(".prgraphic"):
                data = patch_prgraphic(data)
            files.append((info, data))

    output = zip_bytes(files)
    for destination in OUTPUTS:
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(output)
        print(f"Wrote {destination.relative_to(ROOT)} ({len(output)} bytes)")


if __name__ == "__main__":
    build()
