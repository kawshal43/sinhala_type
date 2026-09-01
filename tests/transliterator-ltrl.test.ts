import { describe, expect, it } from "vitest";
import { transliterate } from "../src/core/transliterator";

describe("case-sensitive LTRL-style phonetics", () => {
  it.each([
    ["A", "\u0D87"],
    ["Aa", "\u0D88"],
    ["I", "\u0D93"],
    ["ie", "\u0D8A"],
    ["ea", "\u0D92"],
    ["ei", "\u0D92"],
    ["oe", "\u0D95"],
    ["R", "\u0D8D"],
    ["kA", "\u0D9A\u0DD0"],
    ["kAa", "\u0D9A\u0DD1"],
    ["kI", "\u0D9A\u0DDB"],
    ["kie", "\u0D9A\u0DD3"],
    ["kea", "\u0D9A\u0DDA"],
    ["kei", "\u0D9A\u0DDA"],
    ["koe", "\u0D9A\u0DDD"],
    ["kR", "\u0D9A\u0DD8"]
  ])("maps vowel alias %s", (input, expected) => {
    expect(transliterate(input)).toBe(expected);
  });

  it.each([
    ["Ga", "\u0D9D"],
    ["Cha", "\u0DA1"],
    ["Ta", "\u0DA8"],
    ["Da", "\u0DAA"],
    ["Tha", "\u0DAE"],
    ["Dha", "\u0DB0"],
    ["Na", "\u0DAB"],
    ["Ba", "\u0DB9"],
    ["Sha", "\u0DC2"],
    ["La", "\u0DC5"],
    ["GNa", "\u0DA5"],
    ["KNa", "\u0DA4"]
  ])("maps case-sensitive consonant %s", (input, expected) => {
    expect(transliterate(input)).toBe(expected);
  });

  it.each([
    ["chha", "\u0DA1"],
    ["ttha", "\u0DA8"],
    ["ddha", "\u0DAA"],
    ["nna", "\u0DAB"],
    ["nnda", "\u0DAC"],
    ["thha", "\u0DAE"],
    ["dhha", "\u0DB0"],
    ["ndha", "\u0DB3"],
    ["mba", "\u0DB9"],
    ["ssha", "\u0DC2"],
    ["lla", "\u0DC5"]
  ])("maps expanded lowercase consonant %s", (input, expected) => {
    expect(transliterate(input)).toBe(expected);
  });

  it.each([
    ["kra", "\u0D9A\u0DCA\u200D\u0DBB"],
    ["kraa", "\u0D9A\u0DCA\u200D\u0DBB\u0DCF"],
    ["krA", "\u0D9A\u0DCA\u200D\u0DBB\u0DD0"],
    ["kYa", "\u0D9A\u0DCA\u200D\u0DBA"],
    ["kru", "\u0D9A\u0DD8"],
    ["kruu", "\u0D9A\u0DF2"]
  ])("maps Sinhala cluster %s", (input, expected) => {
    expect(transliterate(input)).toBe(expected);
  });

  it("maps anusvara, visarga and escaped forms", () => {
    expect(transliterate("aN aH")).toBe("\u0D85\u0D82 \u0D85\u0D83");
    expect(transliterate(String.raw`a\n a\h \N \R \rka`)).toBe(
      "\u0D85\u0D82 \u0D85\u0D83 \u0D9E \u0D8D \u0DBB\u0DCA\u200D\u0D9A"
    );
  });

  it("preserves genuine English titles and initialisms", () => {
    expect(transliterate("Adobe Premiere Pro Windows AI API This")).toBe(
      "Adobe Premiere Pro Windows AI API This"
    );
    expect(transliterate("GN KN Sha Tha")).toBe("\u0DA5\u0DCA \u0DA4\u0DCA \u0DC2 \u0DAE");
  });

  it("can force ordinary English-looking title words through the converter", () => {
    expect(transliterate("Mama", { preserveEnglish: false })).toBe("\u0DB8\u0DB8");
  });
});
