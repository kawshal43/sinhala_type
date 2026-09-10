import { describe, expect, it } from "vitest";
import { transliterate } from "../src/core/transliterator";

describe("English + Sinhala dual-language typing", () => {
  it("preserves CamelCase and PascalCase English brand/tech names automatically", () => {
    expect(transliterate("YouTube")).toBe("YouTube");
    expect(transliterate("ChatGPT")).toBe("ChatGPT");
    expect(transliterate("AutoCap")).toBe("AutoCap");
    expect(transliterate("TikTok")).toBe("TikTok");
    expect(transliterate("WhatsApp")).toBe("WhatsApp");
    expect(transliterate("iPhone")).toBe("iPhone");
    expect(transliterate("iPad")).toBe("iPad");
    expect(transliterate("PremierePro")).toBe("PremierePro");
    expect(transliterate("NodeJS")).toBe("NodeJS");
  });

  it("preserves common creator loanwords in lowercase without phonetic corruption", () => {
    expect(transliterate("channel")).toBe("channel");
    expect(transliterate("subscribe")).toBe("subscribe");
    expect(transliterate("edit")).toBe("edit");
    expect(transliterate("cut")).toBe("cut");
    expect(transliterate("render")).toBe("render");
    expect(transliterate("camera")).toBe("camera");
    expect(transliterate("mic")).toBe("mic");
    expect(transliterate("zoom")).toBe("zoom");
    expect(transliterate("link")).toBe("link");
    expect(transliterate("timeline")).toBe("timeline");
  });

  it("converts mixed English + Sinhala sentences naturally", () => {
    const res1 = transliterate("mama YouTube clip eka edit kala");
    expect(res1).toContain("මම");
    expect(res1).toContain("YouTube");
    expect(res1).toContain("clip");
    expect(res1).toContain("edit");

    const res2 = transliterate("mage channel eka subscribe karanna");
    expect(res2).toContain("channel");
    expect(res2).toContain("subscribe");
    expect(res2).toContain("කරන්න");

    const res3 = transliterate("aluth camera ekai mic ekai gaththa");
    expect(res3).toContain("අලුත්");
    expect(res3).toContain("camera");
    expect(res3).toContain("mic");
  });

  it("preserves English text inside quotes, backticks, brackets and braces", () => {
    expect(transliterate('api "zoom call" ekak gamu')).toBe('අපි "zoom call" එකක් ගමු');
    expect(transliterate("mama `special effect` ekak damma")).toContain("special effect");
    expect(transliterate("me [color grading] eka lassanai")).toBe("මෙ color grading එක ලස්සනෛ");
    expect(transliterate("api {Premiere Pro} use karanawa")).toBe("අපි Premiere Pro යූස් කරනවා");
  });

  it("supports user-defined custom English words", () => {
    const custom = ["mybrand", "vlogmaster", "sinhalacreator"];
    const res = transliterate("mama mybrand eka patan gaththa", { customEnglishWords: custom });
    expect(res).toContain("mybrand");
    expect(res).toContain("මම");
  });

  it("allows disabling common English loanwords when strict phonetics is desired", () => {
    const strict = transliterate("edit", { preserveCommonEnglishWords: false });
    expect(strict).not.toBe("edit");
  });

  it("preserves URLs, emails, 4K, 60fps, and initialisms alongside Sinhala", () => {
    const res = transliterate("mama 4K 60fps video ekak https://youtube.com ekata upload kala");
    expect(res).toContain("4K");
    expect(res).toContain("60fps");
    expect(res).toContain("https://youtube.com");
    expect(res).toContain("upload");
  });
});
