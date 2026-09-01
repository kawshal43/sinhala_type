import { describe, expect, it } from "vitest";
import { SINHALA_ALPHABET, unicodeCodePoints } from "../src/core/unicodeMapping";
import { transliterate } from "../src/core/transliterator";

const assignedVowels = [
  0x0d85, 0x0d86, 0x0d87, 0x0d88, 0x0d89, 0x0d8a, 0x0d8b, 0x0d8c,
  0x0d8d, 0x0d8e, 0x0d8f, 0x0d90, 0x0d91, 0x0d92, 0x0d93, 0x0d94, 0x0d95, 0x0d96
];

const assignedConsonants = [
  ...Array.from({ length: 24 }, (_, index) => 0x0d9a + index),
  ...Array.from({ length: 9 }, (_, index) => 0x0db3 + index),
  0x0dbd,
  ...Array.from({ length: 7 }, (_, index) => 0x0dc0 + index)
];

describe("complete Sinhala alphabet coverage", () => {
  it("contains every assigned Unicode vowel and consonant exactly once", () => {
    const expected = [...assignedVowels, ...assignedConsonants]
      .map((point) => `U+${point.toString(16).toUpperCase().padStart(4, "0")}`);
    expect(unicodeCodePoints(SINHALA_ALPHABET.join(""))).toEqual(expected);
    expect(new Set(SINHALA_ALPHABET).size).toBe(59);
  });

  it.each([
    ["R", "\u0D8D"], ["RR", "\u0D8E"], ["LR", "\u0D8F"], ["LRR", "\u0D90"],
    ["nja", "\u0DA6"], ["kLR", "\u0D9A\u0DDF"], ["kLRR", "\u0D9A\u0DF3"]
  ])("types the classical letter sequence %s", (input, expected) => {
    expect(transliterate(input)).toBe(expected);
  });
});
