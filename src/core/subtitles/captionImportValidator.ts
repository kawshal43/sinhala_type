import type { SubtitleCue } from "./srtParser";

export type ValidationIssueCode =
  | "EMPTY_TEXT"
  | "INVALID_TIMESTAMP"
  | "NEGATIVE_TIME"
  | "ZERO_DURATION"
  | "OVERLAP"
  | "OUT_OF_RANGE";

export interface ValidationIssue {
  type: "warning" | "error";
  code: ValidationIssueCode;
  cueId: number;
  cueIndex: number;
  message: string;
}

export interface CaptionValidationReport {
  valid: boolean;
  hasErrors: boolean;
  hasWarnings: boolean;
  issues: ValidationIssue[];
  repairedCues: SubtitleCue[];
  prunedEmptyCount: number;
}

/**
 * Validates subtitle cues for Premiere Pro caption track import.
 * Detects invalid timestamps, empty cues, negative times, overlaps, and out-of-range bounds.
 * Prunes empty cues and repairs micro-overlaps without shifting speech timing.
 */
export function validateAndRepairCaptionDocument(
  cues: SubtitleCue[],
  maxDurationSec?: number
): CaptionValidationReport {
  const issues: ValidationIssue[] = [];
  const validCues: SubtitleCue[] = [];
  let prunedEmptyCount = 0;

  // 1. Initial pass: sanitize, prune empty, and validate finite numbers
  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    const text = (cue.text || "").trim();

    if (!text) {
      prunedEmptyCount++;
      issues.push({
        type: "warning",
        code: "EMPTY_TEXT",
        cueId: cue.id || i + 1,
        cueIndex: i,
        message: `Cue #${cue.id || i + 1} has empty text and will be removed.`
      });
      continue;
    }

    const rawStart = typeof cue.startTime === "number" ? cue.startTime : cue.start;
    const rawEnd = typeof cue.endTime === "number" ? cue.endTime : cue.end;

    if (
      typeof rawStart !== "number" ||
      typeof rawEnd !== "number" ||
      !Number.isFinite(rawStart) ||
      !Number.isFinite(rawEnd) ||
      Number.isNaN(rawStart) ||
      Number.isNaN(rawEnd)
    ) {
      issues.push({
        type: "error",
        code: "INVALID_TIMESTAMP",
        cueId: cue.id || i + 1,
        cueIndex: i,
        message: `Cue #${cue.id || i + 1} has non-finite or invalid timestamps (${rawStart} -> ${rawEnd}).`
      });
      continue;
    }

    if (rawStart < 0 || rawEnd < 0) {
      issues.push({
        type: "error",
        code: "NEGATIVE_TIME",
        cueId: cue.id || i + 1,
        cueIndex: i,
        message: `Cue #${cue.id || i + 1} has negative timestamp (${rawStart}s).`
      });
      continue;
    }

    let start = Math.round(rawStart * 1000) / 1000;
    let end = Math.round(rawEnd * 1000) / 1000;

    if (end <= start) {
      issues.push({
        type: "warning",
        code: "ZERO_DURATION",
        cueId: cue.id || i + 1,
        cueIndex: i,
        message: `Cue #${cue.id || i + 1} duration was <= 0s. Auto-adjusting to 0.5s minimum.`
      });
      end = start + 0.5;
    }

    if (typeof maxDurationSec === "number" && maxDurationSec > 0 && start >= maxDurationSec) {
      issues.push({
        type: "warning",
        code: "OUT_OF_RANGE",
        cueId: cue.id || i + 1,
        cueIndex: i,
        message: `Cue #${cue.id || i + 1} starts at ${start}s which is beyond audio duration (${maxDurationSec}s).`
      });
    }

    validCues.push({
      ...cue,
      id: validCues.length + 1,
      start,
      end,
      startTime: start,
      endTime: end,
      text
    });
  }

  // 2. Second pass: detect and repair overlaps without shifting whole tracks
  const repairedCues: SubtitleCue[] = [];
  for (let i = 0; i < validCues.length; i++) {
    const current = { ...validCues[i] };
    if (i > 0) {
      const prev = repairedCues[i - 1];
      const prevEnd = prev.endTime ?? prev.end;
      const currStart = current.startTime ?? current.start;

      if (prevEnd > currStart) {
        issues.push({
          type: "warning",
          code: "OVERLAP",
          cueId: current.id,
          cueIndex: i,
          message: `Overlap detected between cue #${prev.id} (${prevEnd}s) and cue #${current.id} (${currStart}s). Auto-clamped.`
        });

        // Clamp previous end to current start with a 0.02s gap if duration permits
        const prevStart = prev.startTime ?? prev.start;
        if (currStart - prevStart >= 0.3) {
          const clampedEnd = Math.max(prevStart + 0.2, currStart - 0.02);
          prev.endTime = clampedEnd;
          prev.end = clampedEnd;
        } else {
          // Push current start slightly forward if previous cannot be shortened
          const pushedStart = prevEnd + 0.02;
          const currEnd = current.endTime ?? current.end;
          current.startTime = pushedStart;
          current.start = pushedStart;
          const pushedEnd = Math.max(pushedStart + 0.3, currEnd);
          current.endTime = pushedEnd;
          current.end = pushedEnd;
        }
      }
    }
    repairedCues.push(current);
  }

  const hasErrors = issues.some((i) => i.type === "error");
  const hasWarnings = issues.some((i) => i.type === "warning");

  return {
    valid: !hasErrors,
    hasErrors,
    hasWarnings,
    issues,
    repairedCues,
    prunedEmptyCount
  };
}
