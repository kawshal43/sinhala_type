import { describe, expect, it } from "vitest";
import { PHONETIC_CATEGORIES, WIJESEKARA_ROWS } from "../src/core/keyboardLayouts";
import { SINHALA_ALPHABET } from "../src/core/unicodeMapping";
import { transliterate } from "../src/core/transliterator";

describe("on-screen Sinhala keyboards", () => {
  it("has unique key ids and correct Easy Phonetic output", () => {
    const keys = PHONETIC_CATEGORIES.flatMap((category) => category.keys);
    expect(new Set(keys.map(({ id }) => id)).size).toBe(keys.length);
    for (const item of keys.filter(({ token }) => /^[A-Za-z\\]+$/.test(token))) {
      expect(transliterate(item.token)).toBe(item.output);
    }
  });

  it("includes every assigned Sinhala vowel and consonant", () => {
    const available = new Set(PHONETIC_CATEGORIES.flatMap((category) => category.keys.map(({ output }) => output)));
    for (const letter of SINHALA_ALPHABET) expect(available.has(letter), `missing ${letter}`).toBe(true);
  });

  it("contains three complete physical Wijesekara rows", () => {
    expect(WIJESEKARA_ROWS.map((row) => row.length)).toEqual([12, 11, 10]);
    expect(WIJESEKARA_ROWS.flat().every(({ normal }) => normal.length > 0)).toBe(true);
  });
});
