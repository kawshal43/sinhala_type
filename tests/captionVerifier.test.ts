import { describe, expect, it } from "vitest";
import {
  auditSubtitleVerification,
  findAudioGaps,
  findSuspiciousCues,
  mergeAndSortCues
} from "../src/core/subtitles/captionVerifier";
import type { SubtitleCue } from "../src/core/subtitles/srtParser";

describe("captionVerifier", () => {
  it("detects suspicious cues (empty, single-letter, or long duration with tiny text)", () => {
    const cues: SubtitleCue[] = [
      { id: 1, start: 0, end: 2, text: "Good morning everyone" },
      { id: 2, start: 2.5, end: 4.5, text: "ඒ" }, // suspicious single letter
      { id: 3, start: 5, end: 6, text: "" }, // empty
      { id: 4, start: 6.5, end: 10, text: "yes" } // long duration (3.5s) with tiny word
    ];

    const suspicious = findSuspiciousCues(cues);
    expect(suspicious).toEqual([1, 2, 3]);
  });

  it("detects audio gaps at beginning, middle, and trailing audio", () => {
    const cues: SubtitleCue[] = [
      { id: 1, start: 3.0, end: 5.0, text: "First line" },
      { id: 2, start: 9.0, end: 12.0, text: "Second line" }
    ];

    // Audio is 20 seconds long
    const gaps = findAudioGaps(cues, 20.0, 2.0);

    // Gap 1: 0.0 - 3.0 (before first cue)
    // Gap 2: 5.0 - 9.0 (between line 1 and 2)
    // Gap 3: 12.0 - 20.0 (trailing gap)
    expect(gaps.length).toBe(3);
    expect(gaps[0].start).toBe(0);
    expect(gaps[0].end).toBe(3.0);
    expect(gaps[1].start).toBe(5.0);
    expect(gaps[1].end).toBe(9.0);
    expect(gaps[2].start).toBe(12.0);
    expect(gaps[2].end).toBe(20.0);
  });

  it("merges new cues into existing cues in chronological order and clamps overlaps", () => {
    const existing: SubtitleCue[] = [
      { id: 1, start: 0, end: 3, text: "Hello" },
      { id: 2, start: 8, end: 11, text: "Goodbye" }
    ];

    const filledGaps: SubtitleCue[] = [
      { id: 99, start: 3.5, end: 7.5, text: "How are you doing today" }
    ];

    const merged = mergeAndSortCues(existing, filledGaps);
    expect(merged.length).toBe(3);
    expect(merged[0].text).toBe("Hello");
    expect(merged[1].text).toBe("How are you doing today");
    expect(merged[2].text).toBe("Goodbye");
    expect(merged.map((c) => c.id)).toEqual([1, 2, 3]);
  });

  it("produces an audit report verifying audio coverage and completeness", () => {
    const cues: SubtitleCue[] = [
      { id: 1, start: 0, end: 5, text: "Complete caption line" }
    ];

    const audit = auditSubtitleVerification(cues, 5.0);
    expect(audit.isFullyVerified).toBe(true);
    expect(audit.emptyCount).toBe(0);
    expect(audit.suspiciousCount).toBe(0);
    expect(audit.gapCount).toBe(0);
    expect(audit.summary).toContain("100% Verified");
  });
});

