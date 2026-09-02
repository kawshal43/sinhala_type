import { describe, expect, it } from "vitest";
import { mergeCues, optimizeAllCues, reindexCues, shiftCues, splitCueByCPL } from "../src/core/subtitles/captionOptimizer";
import type { SubtitleCue } from "../src/core/subtitles/srtParser";

describe("captionOptimizer", () => {
  const cues: SubtitleCue[] = [
    { id: 10, start: 1.0, end: 3.0, text: "First cue" },
    { id: 20, start: 3.5, end: 6.0, text: "Second cue" }
  ];

  it("reindexes cues sequentially from 1", () => {
    const reindexed = reindexCues(cues);
    expect(reindexed[0].id).toBe(1);
    expect(reindexed[1].id).toBe(2);
  });

  it("shifts cues by positive and negative offsets", () => {
    const shiftedForward = shiftCues(cues, 1.5);
    expect(shiftedForward[0].start).toBe(2.5);
    expect(shiftedForward[0].end).toBe(4.5);

    const shiftedBackward = shiftCues(cues, -0.5);
    expect(shiftedBackward[0].start).toBe(0.5);
    expect(shiftedBackward[0].end).toBe(2.5);

    const clamped = shiftCues(cues, -10);
    expect(clamped[0].start).toBe(0);
    expect(clamped[0].end).toBe(2.0);
  });

  it("merges two cues", () => {
    const merged = mergeCues(cues[0], cues[1]);
    expect(merged.start).toBe(1.0);
    expect(merged.end).toBe(6.0);
    expect(merged.text).toBe("First cue Second cue");
  });

  it("splits long cues by CPL", () => {
    const longCue: SubtitleCue = {
      id: 1,
      start: 0,
      end: 10,
      text: "This is a very long sentence that exceeds the standard characters per line limit and should be split into multiple chunks"
    };

    const splits = splitCueByCPL(longCue, 30);
    expect(splits.length).toBeGreaterThan(1);
    expect(splits[0].start).toBe(0);
    expect(splits[splits.length - 1].end).toBe(10);
    splits.forEach((chunk) => {
      expect(chunk.text.length).toBeLessThanOrEqual(35); // approximately max CPL
    });
  });

  it("optimizes an entire list of cues", () => {
    const longCue: SubtitleCue = {
      id: 1,
      start: 0,
      end: 8,
      text: "One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen"
    };
    const optimized = optimizeAllCues([longCue], 25);
    expect(optimized.length).toBeGreaterThan(1);
    expect(optimized[0].id).toBe(1);
    expect(optimized[1].id).toBe(2);
  });
});

