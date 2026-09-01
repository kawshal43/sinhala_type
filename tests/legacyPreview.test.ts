import { describe, expect, it } from "vitest";
import { unicodeToDlManel } from "sinhala-unicode-coverter";

describe("Wije 6 display-only preview", () => {
  it("converts Unicode to legacy display codes", () => {
    expect(unicodeToDlManel("මෙයා")).toBe("fuhd");
    expect(unicodeToDlManel("මම")).toBe("uu");
  });

  it("does not replace the canonical Unicode value", () => {
    const unicode = "මම අද ගෙදර යනවා";
    expect(unicodeToDlManel(unicode)).not.toBe(unicode);
    expect(unicode).toBe("\u0DB8\u0DB8 \u0D85\u0DAF \u0D9C\u0DD9\u0DAF\u0DBB \u0DBA\u0DB1\u0DC0\u0DCF");
  });
});
