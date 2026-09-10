import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";

function readZipEntry(archive: Buffer, requestedName: string): Buffer {
  let eocd = -1;
  for (let offset = archive.length - 22; offset >= Math.max(0, archive.length - 65_557); offset--) {
    if (archive.readUInt32LE(offset) === 0x06054b50) { eocd = offset; break; }
  }
  if (eocd < 0) throw new Error("Invalid MOGRT ZIP: EOCD record is missing.");

  const entryCount = archive.readUInt16LE(eocd + 10);
  let centralOffset = archive.readUInt32LE(eocd + 16);
  for (let entry = 0; entry < entryCount; entry++) {
    if (archive.readUInt32LE(centralOffset) !== 0x02014b50) throw new Error("Invalid central directory.");
    const method = archive.readUInt16LE(centralOffset + 10);
    const compressedSize = archive.readUInt32LE(centralOffset + 20);
    const nameLength = archive.readUInt16LE(centralOffset + 28);
    const extraLength = archive.readUInt16LE(centralOffset + 30);
    const commentLength = archive.readUInt16LE(centralOffset + 32);
    const localOffset = archive.readUInt32LE(centralOffset + 42);
    const name = archive.subarray(centralOffset + 46, centralOffset + 46 + nameLength).toString("utf8");
    if (name === requestedName) {
      if (archive.readUInt32LE(localOffset) !== 0x04034b50) throw new Error("Invalid local ZIP header.");
      const localNameLength = archive.readUInt16LE(localOffset + 26);
      const localExtraLength = archive.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = archive.subarray(dataStart, dataStart + compressedSize);
      if (method === 0) return compressed;
      if (method === 8) return inflateRawSync(compressed);
      throw new Error(`Unsupported ZIP compression method: ${method}`);
    }
    centralOffset += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error(`MOGRT entry not found: ${requestedName}`);
}

describe("bundled AutoCap caption MOGRT", () => {
  const mogrt = readFileSync("cep/AutoCap/assets/AutoCapCaption.mogrt");
  const definition = JSON.parse(readZipEntry(mogrt, "definition.json").toString("utf8"));

  it("is a Premiere-authored editable graphic with a caption text control", () => {
    expect(definition.authorApp).toBe("ppro");
    const control = definition.clientControls.find((item: any) =>
      item.uiName?.strDB?.some((name: any) => name.localeString === "en_US" && name.str === "Caption Text")
    );
    expect(control?.type).toBe(6);
  });

  it("enables font and size editing with a mixed-script default font", () => {
    const control = definition.clientControls.find((item: any) => item.fonteditinfo);
    expect(control.fonteditinfo).toMatchObject({
      capPropFontEdit: true,
      capPropFontFauxStyleEdit: true,
      capPropFontSizeEdit: true,
      fontEditValue: "NotoSansSinhala-Regular",
      fontSizeEditValue: 64
    });
    expect(definition.usedFontsLocalized.en_US).toContain("NotoSansSinhala-Regular");
  });

  it("contains its editable Premiere graphic project", () => {
    expect(readZipEntry(mogrt, "project.prgraphic").length).toBeGreaterThan(1_000);
  });
});
