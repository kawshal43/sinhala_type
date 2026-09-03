import type { SubtitleCue } from "./srtParser";
import { reindexCues } from "./captionOptimizer";

export interface AudioGap {
  start: number;
  end: number;
  duration: number;
  insertAfterIndex: number;
}

export interface VerificationAuditReport {
  totalCues: number;
  emptyCount: number;
  suspiciousCount: number;
  gapCount: number;
  coveragePercent: number;
  isFullyVerified: boolean;
  summary: string;
}

/**
 * Identifies indices of cues that are empty, suspiciously clipped,
 * or unusually short compared to their duration (e.g. single character like "ඒ").
 */
export function findSuspiciousCues(cues: SubtitleCue[]): number[] {
  const suspiciousIndices: number[] = [];

  cues.forEach((cue, idx) => {
    const text = cue.text.trim();
    const duration = cue.end - cue.start;

    // Empty text
    if (text.length === 0) {
      suspiciousIndices.push(idx);
      return;
    }

    // Single or double character cues (e.g. "ඒ", "අ", "ඔ")
    if (text.length <= 2) {
      suspiciousIndices.push(idx);
      return;
    }

    // Long duration but very few characters (likely missed words or cutoff speech)
    if (duration >= 2.0 && text.length < 5 && !text.includes(" ")) {
      suspiciousIndices.push(idx);
      return;
    }
  });

  return suspiciousIndices;
}

/**
 * Scans the subtitle timeline and detects uncaptioned gaps where dialogue might have been missed.
 * Checks the beginning, between consecutive cues, and at the end up to audio duration.
 */
export function findAudioGaps(
  cues: SubtitleCue[],
  audioDuration: number,
  minGapSec = 2.0
): AudioGap[] {
  const gaps: AudioGap[] = [];

  if (cues.length === 0) {
    if (audioDuration >= minGapSec) {
      gaps.push({
        start: 0,
        end: audioDuration,
        duration: audioDuration,
        insertAfterIndex: -1
      });
    }
    return gaps;
  }

  // 1. Gap at beginning (before first cue)
  if (cues[0].start >= minGapSec) {
    gaps.push({
      start: 0,
      end: cues[0].start,
      duration: cues[0].start,
      insertAfterIndex: -1
    });
  }

  // 2. Gaps between consecutive cues
  for (let i = 0; i < cues.length - 1; i++) {
    const currentEnd = cues[i].end;
    const nextStart = cues[i + 1].start;
    const gapDuration = nextStart - currentEnd;

    if (gapDuration >= minGapSec) {
      gaps.push({
        start: currentEnd,
        end: nextStart,
        duration: gapDuration,
        insertAfterIndex: i
      });
    }
  }

  // 3. Gap at the end (after last cue up to audioDuration)
  const lastCueEnd = cues[cues.length - 1].end;
  if (audioDuration > 0 && audioDuration - lastCueEnd >= minGapSec) {
    gaps.push({
      start: lastCueEnd,
      end: audioDuration,
      duration: audioDuration - lastCueEnd,
      insertAfterIndex: cues.length - 1
    });
  }

  return gaps;
}

/**
 * Merges newly filled cues into the existing cue list chronologically,
 * clamps any overlapping timestamps, and reindexes sequentially.
 */
export function mergeAndSortCues(
  existingCues: SubtitleCue[],
  newCues: SubtitleCue[]
): SubtitleCue[] {
  if (newCues.length === 0) return reindexCues(existingCues);

  const combined = [...existingCues, ...newCues];

  // Sort by start time ascending
  combined.sort((a, b) => {
    if (Math.abs(a.start - b.start) > 0.001) {
      return a.start - b.start;
    }
    return a.end - b.end;
  });

  // Clamp overlaps
  for (let i = 0; i < combined.length - 1; i++) {
    const current = combined[i];
    const next = combined[i + 1];

    if (current.end > next.start) {
      current.end = Math.max(current.start + 0.2, next.start - 0.05);
    }
  }

  return reindexCues(combined);
}

/**
 * Audits subtitle cues against audio duration and checks completeness.
 */
export function auditSubtitleVerification(
  cues: SubtitleCue[],
  audioDuration: number
): VerificationAuditReport {
  const suspicious = findSuspiciousCues(cues);
  const gaps = findAudioGaps(cues, audioDuration, 2.5);

  let emptyCount = 0;
  cues.forEach((c) => {
    if (!c.text.trim()) emptyCount++;
  });

  let speechDuration = 0;
  cues.forEach((c) => {
    speechDuration += Math.max(0, c.end - c.start);
  });

  const validDuration = audioDuration > 0 ? audioDuration : Math.max(1, cues[cues.length - 1]?.end || 1);
  const coveragePercent = Math.min(100, Math.round((speechDuration / validDuration) * 100));

  const isFullyVerified = emptyCount === 0 && suspicious.length === 0 && gaps.length === 0;

  let summary = `✓ 100% Verified: All ${cues.length} captions complete & verified.`;
  if (!isFullyVerified) {
    const issues: string[] = [];
    if (suspicious.length > 0) issues.push(`${suspicious.length} incomplete/short cue${suspicious.length > 1 ? "s" : ""}`);
    if (gaps.length > 0) issues.push(`${gaps.length} uncaptioned gap${gaps.length > 1 ? "s" : ""}`);
    summary = `Verified with notices: ${issues.join(", ")}.`;
  }

  return {
    totalCues: cues.length,
    emptyCount,
    suspiciousCount: suspicious.length,
    gapCount: gaps.length,
    coveragePercent,
    isFullyVerified,
    summary
  };
}

