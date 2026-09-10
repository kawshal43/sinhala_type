import { describe, expect, it } from "vitest";
import {
  applyChunkOffset,
  createTimelineCaptionDocument,
  fromTimelineCues,
  toTimelineCues,
  verifySequenceTarget
} from "../src/core/subtitles/timelineContext";
import type { SubtitleCue } from "../src/core/subtitles/srtParser";

describe("timelineContext", () => {
  const sampleCues: SubtitleCue[] = [
    { id: 1, start: 0.5, end: 3.2, startTime: 0.5, endTime: 3.2, text: "ආයුබෝවන්" },
    { id: 2, start: 3.5, end: 6.8, startTime: 3.5, endTime: 6.8, text: "සුබ දවසක් වේවා" }
  ];

  it("creates a valid TimelineCaptionDocument with audio-relative coordinates", () => {
    const doc = createTimelineCaptionDocument("seq-101", 10.0, 30.0, sampleCues);
    expect(doc.sequenceId).toBe("seq-101");
    expect(doc.timelineStartSec).toBe(10.0);
    expect(doc.audioDurationSec).toBe(30.0);
    expect(doc.cues[0].startTime).toBe(0.5);
    expect(doc.cues[0].endTime).toBe(3.2);
  });

  it("applies sequence timeline offset exactly once in toTimelineCues", () => {
    const doc = createTimelineCaptionDocument("seq-101", 15.0, 30.0, sampleCues);
    const timelineCues = toTimelineCues(doc);

    expect(timelineCues[0].startTime).toBe(15.5); // 0.5 + 15.0
    expect(timelineCues[0].endTime).toBe(18.2);   // 3.2 + 15.0
    expect(timelineCues[1].startTime).toBe(18.5); // 3.5 + 15.0
    expect(timelineCues[1].endTime).toBe(21.8);   // 6.8 + 15.0

    // Original document cues must remain unchanged (relative)
    expect(doc.cues[0].startTime).toBe(0.5);
  });

  it("correctly converts timeline-positioned cues back to audio-relative coordinates", () => {
    const timelineCues: SubtitleCue[] = [
      { id: 1, start: 25.5, end: 28.2, startTime: 25.5, endTime: 28.2, text: "ආයුබෝවන්" }
    ];
    const doc = fromTimelineCues("seq-101", 25.0, 10.0, timelineCues);
    expect(doc.cues[0].startTime).toBe(0.5);
    expect(doc.cues[0].endTime).toBe(3.2);
  });

  it("applies chunk-local offsets accurately", () => {
    const chunkCues: SubtitleCue[] = [
      { id: 1, start: 1.0, end: 2.5, startTime: 1.0, endTime: 2.5, text: "ටෙස්ට්" }
    ];
    const shifted = applyChunkOffset(chunkCues, 45.0);
    expect(shifted[0].startTime).toBe(46.0);
    expect(shifted[0].endTime).toBe(47.5);
  });

  it("verifies sequence target match and prevents cross-sequence import", () => {
    const valid = verifySequenceTarget("seq_alpha", "seq_alpha");
    expect(valid.matches).toBe(true);

    const mismatch = verifySequenceTarget("seq_alpha", "seq_beta");
    expect(mismatch.matches).toBe(false);
    expect(mismatch.message).toContain("does not match");

    const empty = verifySequenceTarget("", "seq_beta");
    expect(empty.matches).toBe(false);
  });
});
