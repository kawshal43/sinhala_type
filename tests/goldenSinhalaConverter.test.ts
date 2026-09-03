import { describe, it, expect } from "vitest";
import {
  convertCaptionText,
  convertSubtitleCues,
  getSinhalaFontTestSamples,
  isSinhalaText
} from "../src/core/subtitles/captionConverter";
import { unicodeToDlManel } from "sinhala-unicode-coverter";
import { unicodeToIsi } from "../src/core/isiConverter";

describe("Golden-Master Sinhala Converter Regression Suite", () => {
  describe("Basic & Independent Vowels", () => {
    const vowels = [
      { text: "අම්මා", label: "A - Amma" },
      { text: "ආයුබෝවන්", label: "Aa - Ayubowan" },
      { text: "ඇස", label: "Ae - Aesa" },
      { text: "ඈත", label: "Aae - Aaetha" },
      { text: "ඉර", label: "I - Ira" },
      { text: "ඊතලය", label: "Ii - Iithalaya" },
      { text: "උදෑසන", label: "U - Udaesana" },
      { text: "ඌරා", label: "Uu - Uura" },
      { text: "එළවළු", label: "E - Elawalu" },
      { text: "ඒකකය", label: "Ee - Eekakaya" },
      { text: "ඔරලෝසුව", label: "O - Oraloosuwa" }
    ];

    it("detects all Sinhala vowel sample strings as Sinhala text", () => {
      for (const item of vowels) {
        expect(isSinhalaText(item.text)).toBe(true);
      }
    });

    it("converts all vowels to valid DL-Manel ANSI output without empty results", () => {
      for (const item of vowels) {
        const wije = convertCaptionText(item.text, "wije");
        expect(wije).toBeDefined();
        expect(wije.length).toBeGreaterThan(0);
        // Should not remain identical to raw Sinhala Unicode
        expect(wije).not.toBe(item.text);
      }
    });

    it("converts all vowels to valid Isi ANSI output without empty results", () => {
      for (const item of vowels) {
        const isi = convertCaptionText(item.text, "isi");
        expect(isi).toBeDefined();
        expect(isi.length).toBeGreaterThan(0);
        expect(isi).not.toBe(item.text);
      }
    });
  });

  describe("Complex Diacritics & Combining Characters (පිල්ලම්)", () => {
    const diacritics = [
      { name: "ඇලපිල්ල (ා)", sample: "කතා කරනවා" },
      { name: "ඇදපිල්ල (ැ)", sample: "කැඩී ගිය" },
      { name: "දිග ඇදපිල්ල (ෑ)", sample: "කෑගසනවා" },
      { name: "ඉස්පිල්ල (ි)", sample: "මිනිසුන්" },
      { name: "දිග ඉස්පිල්ල (ී)", sample: "පීනනවා" },
      { name: "පාපිල්ල (ු)", sample: "කුරුල්ලා" },
      { name: "දිග පාපිල්ල (ූ)", sample: "කූඩුව" },
      { name: "කොම්බුව (ෙ)", sample: "ගෙදර යනවා" },
      { name: "කොම්බුව හා හල්කිරීම (ේ)", sample: "ප්‍රේමය" },
      { name: "කොම්බු දෙක (ෛ)", sample: "කෛරාටික" },
      { name: "කොම්බුව හා ඇලපිල්ල (ො)", sample: "කොළඹ නගරය" },
      { name: "කොම්බුව හා දිග ඇලපිල්ල (ෝ)", sample: "ලෝකය පුරා" },
      { name: "කොම්බුව හා ගයනුකිත්ත (ෞ)", sample: "බෞද්ධ සංස්කෘතිය" }
    ];

    it("converts all 13 Sinhala diacritic combinations cleanly in DL-Manel", () => {
      for (const item of diacritics) {
        const result = convertCaptionText(item.sample, "wije");
        expect(result).toBeTruthy();
        expect(result.length).toBeGreaterThan(0);
        // Ensure no unmapped Unicode characters remain in the converted text
        expect(isSinhalaText(result)).toBe(false);
      }
    });

    it("converts all 13 Sinhala diacritic combinations cleanly in Isi", () => {
      for (const item of diacritics) {
        const result = convertCaptionText(item.sample, "isi");
        expect(result).toBeTruthy();
        expect(result.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Special Conjuncts, Rakaransaya, Repaya, Yansaya", () => {
    const specials = [
      { type: "Rakaransaya", text: "ක්‍රියාවලිය, ප්‍රවෘත්ති, ශ්‍රමය, ත්‍රස්ත" },
      { type: "Yansaya", text: "සංඛ්‍යාතය, වාක්‍යය, ධ්‍යය, ප්‍ය" },
      { type: "Repaya", text: "ධර්‍මය, කර්‍මය, වර්‍ගය, ශ්‍රී" },
      { type: "Sanyaka", text: "ගඟ, ඇඳ, අඹ, කඳ, ළු" },
      { type: "Ksha", text: "පක්ෂය, ක්ෂේත්‍රය, ලක්ෂණ" }
    ];

    it("converts special ligatures and conjuncts without throwing errors", () => {
      for (const item of specials) {
        const wije = convertCaptionText(item.text, "wije");
        const isi = convertCaptionText(item.text, "isi");
        expect(wije).toBeTruthy();
        expect(isi).toBeTruthy();
      }
    });
  });

  describe("Subtitle Set Batch Transformation", () => {
    const mockCues = [
      { id: 1, start: 0, end: 2.5, text: "සුබ දවසක් සියලු දෙනාටම" },
      { id: 2, start: 2.6, end: 5.0, text: "අද අපි කතා කරන්න යන්නේ AutoCap ගැන" },
      { id: 3, start: 5.1, end: 8.0, text: "This is a bilingual test sentence" }
    ];

    it("preserves IDs and timestamps while converting text", () => {
      const wijeCues = convertSubtitleCues(mockCues, "wije");
      expect(wijeCues.length).toBe(mockCues.length);
      expect(wijeCues[0].id).toBe(1);
      expect(wijeCues[0].start).toBe(0);
      expect(wijeCues[0].end).toBe(2.5);
      expect(wijeCues[0].text).not.toBe(mockCues[0].text);

      // Cue 3 has English text, should remain unchanged or readable
      expect(wijeCues[2].text).toContain("This is a bilingual");
    });

    it("returns original cues unchanged when target is unicode", () => {
      const unicodeCues = convertSubtitleCues(mockCues, "unicode");
      expect(unicodeCues).toEqual(mockCues);
    });
  });

  describe("Font Test Samples Consistency", () => {
    it("generates font test samples for each encoding", () => {
      for (const mode of ["unicode", "wije", "isi"] as const) {
        const samples = getSinhalaFontTestSamples(mode);
        expect(samples.length).toBeGreaterThanOrEqual(4);
        for (const s of samples) {
          expect(s.label).toBeDefined();
          expect(s.display).toBeDefined();
          expect(s.display.length).toBeGreaterThan(0);
        }
      }
    });
  });
});

