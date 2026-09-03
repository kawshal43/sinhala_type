import { describe, expect, it } from "vitest";
import {
  isFuzzyTextMatch,
  mergeChunkIntoTimeline,
  normalizeForMergeComparison,
  repairTimestampOverlaps
} from "../src/core/subtitles/timelineMerger";
import type { SubtitleCue } from "../src/core/subtitles/srtParser";

describe("timelineMerger", () => {
  it("normalizes text for merge comparison", () => {
    const raw = "ආයුබෝවන්, හැමෝටම!";
    const norm = normalizeForMergeComparison(raw);
    expect(norm).toBe("ආයුබෝවන්හැමෝටම");
  });

  it("detects fuzzy text matches across chunk boundary", () => {
    // Chunk 1 cut off mid-sentence: "මම අද කතා කරන්නේ"
    // Chunk 2 picked up full sentence: "මම අද කතා කරන්නේ මේ ගැනයි"
    const a = "මම අද කතා කරන්නේ";
    const b = "මම අද කතා කරන්නේ මේ ගැනයි";
    expect(isFuzzyTextMatch(a, b)).toBe(true);
  });

  it("repairs minor timestamp overlaps between cues", () => {
    const overlapping: SubtitleCue[] = [
      { id: 1, start: 0.0, end: 2.5, text: "පළමු පේළිය" },
      { id: 2, start: 2.3, end: 4.5, text: "දෙවන පේළිය" } // overlaps by 0.2s
    ];

    const repaired = repairTimestampOverlaps(overlapping, 0.05);
    expect(repaired[0].end).toBeLessThanOrEqual(repaired[1].start - 0.05);
    expect(repaired[0].start).toBe(0.0);
    expect(repaired[1].start).toBe(2.3);
  });

  it("merges incoming chunk cues, offsets timestamps, and preserves more complete caption", () => {
    const existing: SubtitleCue[] = [
      { id: 1, start: 0.0, end: 2.0, text: "ආයුබෝවන්" },
      { id: 2, start: 88.0, end: 90.0, text: "මම අද" } // Truncated end of chunk 1
    ];

    const incomingFromChunk2: SubtitleCue[] = [
      // Starts at relative 0.0 in chunk 2 (chunk starts at 89.0s -> rebased to 89.0s)
      { id: 1, start: 0.0, end: 2.5, text: "මම අද කතා කරන්නේ මේ ගැනයි" }, // Complete sentence
      { id: 2, start: 3.0, end: 5.0, text: "ඊළඟ පේළිය" }
    ];

    const merged = mergeChunkIntoTimeline(existing, incomingFromChunk2, 89.0, 180.0);
    expect(merged.length).toBe(3);
    expect(merged[0].text).toBe("ආයුබෝවන්");
    // Should have replaced truncated "මම අද" with more complete "මම අද කතා කරන්නේ මේ ගැනයි"
    expect(merged[1].text).toBe("මම අද කතා කරන්නේ මේ ගැනයි");
    expect(merged[2].text).toBe("ඊළඟ පේළිය");
  });
});

