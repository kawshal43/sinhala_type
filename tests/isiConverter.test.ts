import { describe, expect, it } from "vitest";
import { isiMappingSize, unicodeToIsi } from "../src/core/isiConverter";

describe("Unicode to ISI legacy conversion", () => {
  it("bundles the complete supplied Unicode-to-ISI mapping", () => {
    expect(isiMappingSize).toBeGreaterThanOrEqual(1600);
  });

  it.each([
    ["ක", "Y"],
    ["කා", "Y£"],
    ["ක්", "YŠ"],
    ["මම", "vv"],
    ["ශ්‍රී", "|±š"]
  ])("converts %s to ISI codes", (unicode, isi) => {
    expect(unicodeToIsi(unicode)).toBe(isi);
  });

  it("uses longest matches for conjuncts and preserves unrelated text", () => {
    expect(unicodeToIsi("Adobe ශ්‍රී 2026")).toBe("Adobe |±š 2026");
  });

  it("converts අංක without preserving Sinhala or phonetic characters", () => {
    expect(unicodeToIsi("අංක")).toBe("R¹Y");
  });
});
