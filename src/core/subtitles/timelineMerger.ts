/**
 * Timeline merge and deduplication algorithm.
 * Implements Section 8 of the AutoCap Product Architecture:
 * - Adds the chunk timeline offset
 * - Normalizes Sinhala Unicode (NFC)
 * - Identifies captions inside the overlap window
 * - Compares normalized text and timestamps
 * - Removes duplicates and preserves the caption with better completeness
 * - Sorts by start time and repairs minor timestamp overlaps
 */

import type { SubtitleCue } from "./srtParser";

export interface MergeOptions {
  overlapWindowSec?: number; // Maximum overlap window to compare (default: 3.0s)
  minGapSec?: number;        // Minimum gap between consecutive cues (default: 0.05s)
}

/**
 * Normalizes text for comparison by NFC Unicode normalization, lowercasing,
 * and stripping whitespace and punctuation.
 */
export function normalizeForMergeComparison(text: string): string {
  return text
    .normalize("NFC")
    .toLocaleLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, "");
}

/**
 * Checks if two text strings match or if one is a substring/partial sentence of the other.
 */
export function isFuzzyTextMatch(a: string, b: string): boolean {
  const normA = normalizeForMergeComparison(a);
  const normB = normalizeForMergeComparison(b);
  if (!normA || !normB) return false;
  if (normA === normB) return true;

  // Check prefix or suffix containment for truncated boundary sentences
  if (normA.length >= 4 && normB.length >= 4) {
    if (normA.includes(normB) || normB.includes(normA)) return true;
  }
  return false;
}

/**
 * Repairs micro-overlaps between consecutive cues so timestamps never collide.
 * Ensures cue[i].end <= cue[i+1].start - minGap.
 */
export function repairTimestampOverlaps(
  cues: SubtitleCue[],
  minGapSec = 0.05
): SubtitleCue[] {
  if (cues.length <= 1) return [...cues];

  const sorted = [...cues].sort((a, b) => a.start - b.start || a.end - b.end);
  const repaired: SubtitleCue[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const current = { ...sorted[i] };
    const next = sorted[i + 1];

    if (next) {
      // If current end exceeds next start, clamp current end
      if (current.end > next.start - minGapSec) {
        // Clamp to next.start - minGapSec, but ensure at least 0.3s duration
        const maxClampedEnd = Math.max(current.start + 0.3, next.start - minGapSec);
        current.end = Math.min(current.end, maxClampedEnd);
      }
    }

    // Re-verify validity
    if (current.end > current.start && current.text.trim()) {
      repaired.push(current);
    }
  }

  return repaired;
}

/**
 * Merges a newly completed audio chunk's cues into the timeline.
 */
export function mergeChunkIntoTimeline(
  existingCues: SubtitleCue[],
  incomingCues: SubtitleCue[],
  chunkStartOffset = 0,
  maxAudioDuration?: number,
  options: MergeOptions = {}
): SubtitleCue[] {
  const overlapWindow = options.overlapWindowSec ?? 3.0;
  const minGap = options.minGapSec ?? 0.05;

  // 1. Rebase incoming cues by chunk timeline offset
  const rebasedIncoming = incomingCues.map((cue) => {
    const rebasedStart = cue.start + chunkStartOffset;
    let rebasedEnd = cue.end + chunkStartOffset;
    if (maxAudioDuration !== undefined && maxAudioDuration > 0) {
      rebasedEnd = Math.min(maxAudioDuration, rebasedEnd);
    }
    return {
      ...cue,
      start: Math.round(rebasedStart * 1000) / 1000,
      end: Math.round(rebasedEnd * 1000) / 1000,
      text: cue.text.normalize("NFC").trim()
    };
  });

  if (existingCues.length === 0) {
    return repairTimestampOverlaps(rebasedIncoming, minGap).map((c, idx) => ({ ...c, id: idx + 1 }));
  }

  const result = [...existingCues];

  // 2. Iterate incoming cues and check against existing cues in the overlap window
  for (const incoming of rebasedIncoming) {
    let replacedExisting = false;
    let isDuplicate = false;

    // Look at existing cues that fall within the overlap window of this incoming cue
    for (let i = result.length - 1; i >= 0; i--) {
      const existing = result[i];
      // Only compare cues within the overlap time proximity
      if (Math.abs(existing.start - incoming.start) > overlapWindow &&
          Math.abs(existing.end - incoming.end) > overlapWindow) {
        continue;
      }

      const overlapDuration = Math.min(existing.end, incoming.end) - Math.max(existing.start, incoming.start);
      const isTimeOverlapping = overlapDuration > -0.3; // Within 300ms or intersecting

      if (isTimeOverlapping && isFuzzyTextMatch(existing.text, incoming.text)) {
        // Found duplicate / boundary overlap.
        // Rule: Preserve the caption with better completeness (longer text or higher confidence)
        const incomingNorm = normalizeForMergeComparison(incoming.text);
        const existingNorm = normalizeForMergeComparison(existing.text);

        if (incomingNorm.length > existingNorm.length) {
          // Replace with more complete incoming caption
          result[i] = incoming;
          replacedExisting = true;
          break;
        } else {
          // Existing is equal or more complete, skip incoming
          isDuplicate = true;
          break;
        }
      }
    }

    if (!isDuplicate && !replacedExisting) {
      result.push(incoming);
    }
  }

  // 3. Sort chronologically
  result.sort((a, b) => a.start - b.start || a.end - b.end);

  // 4. Repair micro-overlaps and reindex
  return repairTimestampOverlaps(result, minGap).map((c, idx) => ({ ...c, id: idx + 1 }));
}

