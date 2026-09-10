import { describe, expect, it } from "vitest";
import { validateAndRepairCaptionDocument } from "../src/core/subtitles/captionImportValidator";
import type { SubtitleCue } from "../src/core/subtitles/srtParser";

describe("captionImportValidator", () => {
  it("prunes empty cues and returns a warning", () => {
    const rawCues: SubtitleCue[] = [
      { id: 1, start: 0.0, end: 2.0, startTime: 0.0, endTime: 2.0, text: "   " },
      { id: 2, start: 2.5, end: 4.0, startTime: 2.5, endTime: 4.0, text: "ආයුබෝවන්" },
      { id: 3, start: 4.5, end: 6.0, startTime: 4.5, endTime: 6.0, text: "" }
    ];

    const report = validateAndRepairCaptionDocument(rawCues);
    expect(report.valid).toBe(true);
    expect(report.hasWarnings).toBe(true);
    expect(report.prunedEmptyCount).toBe(2);
    expect(report.repairedCues.length).toBe(1);
    expect(report.repairedCues[0].text).toBe("ආයුබෝවන්");
  });

  it("rejects non-finite or negative timestamps with errors", () => {
    const rawCues: SubtitleCue[] = [
      { id: 1, start: NaN, end: 2.0, startTime: NaN, endTime: 2.0, text: "අවලංගු" },
      { id: 2, start: -1.0, end: 3.0, startTime: -1.0, endTime: 3.0, text: "සෘණ කාලය" }
    ];

    const report = validateAndRepairCaptionDocument(rawCues);
    expect(report.valid).toBe(false);
    expect(report.hasErrors).toBe(true);
    expect(report.issues.some((i) => i.code === "INVALID_TIMESTAMP")).toBe(true);
    expect(report.issues.some((i) => i.code === "NEGATIVE_TIME")).toBe(true);
  });

  it("detects and micro-clamps overlapping cues without shifting whole timeline", () => {
    const rawCues: SubtitleCue[] = [
      { id: 1, start: 1.0, end: 3.5, startTime: 1.0, endTime: 3.5, text: "පළමු කොටස" },
      { id: 2, start: 3.2, end: 5.0, startTime: 3.2, endTime: 5.0, text: "දෙවන කොටස" } // 0.3s overlap with #1
    ];

    const report = validateAndRepairCaptionDocument(rawCues);
    expect(report.valid).toBe(true);
    expect(report.hasWarnings).toBe(true);
    expect(report.issues.some((i) => i.code === "OVERLAP")).toBe(true);

    const cues = report.repairedCues;
    expect(cues.length).toBe(2);
    expect(cues[0].endTime ?? cues[0].end).toBeLessThanOrEqual(cues[1].startTime ?? cues[1].start);
  });

  it("adjusts zero duration cues to a safe minimum duration", () => {
    const rawCues: SubtitleCue[] = [
      { id: 1, start: 2.0, end: 2.0, startTime: 2.0, endTime: 2.0, text: "ශුන්‍ය කාලය" }
    ];

    const report = validateAndRepairCaptionDocument(rawCues);
    expect(report.valid).toBe(true);
    expect((report.repairedCues[0].endTime ?? report.repairedCues[0].end)!).toBeGreaterThan((report.repairedCues[0].startTime ?? report.repairedCues[0].start)!);
  });
});
