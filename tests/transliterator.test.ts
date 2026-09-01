import { describe, expect, it } from "vitest";
import { transliterate } from "../src/core/transliterator";
import { isSinhalaUnicodeCharacter, unicodeCodePoints } from "../src/core/unicodeMapping";

describe("SinhalaType core", () => {
  it.each([
    ["mama", "මම"], ["ada", "අද"], ["gedara", "ගෙදර"],
    ["oya kohomada", "ඔයා කොහොමද"],
    ["mama ada gedara yanawa", "මම අද ගෙදර යනවා"],
    ["kohomada, hari!", "කොහොමද, හරි!"]
  ])("converts %s", (input, expected) => expect(transliterate(input)).toBe(expected));

  it("preserves manual English locks", () => {
    expect(transliterate("api {Premiere Pro} use karanawa")).toBe("අපි Premiere Pro යූස් කරනවා");
  });

  it("preserves URLs, numbers and initialisms", () => {
    expect(transliterate("AI 4K https://youtube.com")).toBe("AI 4K https://youtube.com");
  });

  it("uses custom dictionary entries", () => {
    expect(transliterate("rusala", { dictionary: { rusala: "රුසල" } })).toBe("රුසල");
  });

  it("normalizes output", () => {
    expect(transliterate("mama")).toBe(transliterate("mama").normalize("NFC"));
  });

  it("maps the common x anusvara spelling", () => {
    expect(transliterate("axka")).toBe("අංක");
    expect(transliterate("axka ruu")).toBe("අංක රූ");
  });

  it("emits official Sinhala Unicode code points", () => {
    expect(unicodeCodePoints(transliterate("kaa"))).toEqual(["U+0D9A", "U+0DCF"]);
    expect(unicodeCodePoints(transliterate("ki"))).toEqual(["U+0D9A", "U+0DD2"]);
    expect(unicodeCodePoints(transliterate("k"))).toEqual(["U+0D9A", "U+0DCA"]);
    expect(Array.from(transliterate("mama")).every(isSinhalaUnicodeCharacter)).toBe(true);
  });
});
