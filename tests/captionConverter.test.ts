import { describe, expect, it } from "vitest";
import {
  convertCaptionText,
  convertSubtitleCues,
  getSinhalaFontTestSamples,
  isSinhalaText
} from "../src/core/subtitles/captionConverter";
import type { SubtitleCue } from "../src/core/subtitles/srtParser";

describe("captionConverter", () => {
  const cues: SubtitleCue[] = [
    { id: 1, start: 0, end: 2, text: "මම අද ගෙදර යනවා" },
    { id: 2, start: 2.5, end: 4, text: "වීඩියෝ" }
  ];

  it("returns unchanged cues when encoding is unicode", () => {
    const result = convertSubtitleCues(cues, "unicode");
    expect(result[0].text).toBe("මම අද ගෙදර යනවා");
    expect(result[1].text).toBe("වීඩියෝ");
  });

  it("converts cues to Wije format", () => {
    const result = convertSubtitleCues(cues, "wije");
    expect(result[0].text).not.toBe("මම අද ගෙදර යනවා");
    expect(typeof result[0].text).toBe("string");
    expect(result[0].text.length).toBeGreaterThan(0);
  });

  it("converts cues to ISI format", () => {
    const result = convertSubtitleCues(cues, "isi");
    expect(result[0].text).not.toBe("මම අද ගෙදර යනවා");
    expect(typeof result[0].text).toBe("string");
    expect(result[0].text.length).toBeGreaterThan(0);
  });

  it("converts single caption text properly", () => {
    expect(convertCaptionText("මම", "unicode")).toBe("මම");
    expect(convertCaptionText("මම", "wije")).toBeTruthy();
    expect(convertCaptionText("මම", "isi")).toBeTruthy();
  });

  it("accurately detects Sinhala characters in text", () => {
    expect(isSinhalaText("මම අද ගෙදර යනවා")).toBe(true);
    expect(isSinhalaText("AutoCap Subtitle")).toBe(false);
    expect(isSinhalaText("Video 123 !@#")).toBe(false);
    expect(isSinhalaText("Mixed English සහ සිංහල")).toBe(true);
    expect(isSinhalaText("")).toBe(false);
  });

  it("generates font test samples for all encodings", () => {
    const unicodeSamples = getSinhalaFontTestSamples("unicode");
    expect(unicodeSamples.length).toBeGreaterThanOrEqual(4);
    expect(unicodeSamples[0].display).toBe(unicodeSamples[0].unicode);

    const wijeSamples = getSinhalaFontTestSamples("wije");
    expect(wijeSamples[0].display).toBeTruthy();
    expect(wijeSamples[0].display).not.toBe(wijeSamples[0].unicode);

    const isiSamples = getSinhalaFontTestSamples("isi");
    expect(isiSamples[0].display).toBeTruthy();
    expect(isiSamples[0].display).not.toBe(isiSamples[0].unicode);
  });
});
