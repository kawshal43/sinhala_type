import type { SubtitleCue } from "./srtParser";
import type { TimelineCaptionDocument } from "../../platform/premiereHostTypes";

function getCueStart(cue: SubtitleCue): number {
  if (typeof cue.startTime === "number" && !Number.isNaN(cue.startTime)) return cue.startTime;
  if (typeof cue.start === "number" && !Number.isNaN(cue.start)) return cue.start;
  return 0;
}

function getCueEnd(cue: SubtitleCue): number {
  if (typeof cue.endTime === "number" && !Number.isNaN(cue.endTime)) return cue.endTime;
  if (typeof cue.end === "number" && !Number.isNaN(cue.end)) return cue.end;
  return 0;
}

/**
 * Creates a strongly-typed TimelineCaptionDocument where cue times are
 * strictly relative to the exported audio file (0 <= t <= audioDurationSec).
 */
export function createTimelineCaptionDocument(
  sequenceId: string,
  timelineStartSec: number,
  audioDurationSec: number,
  cues: SubtitleCue[]
): TimelineCaptionDocument {
  const safeCues = cues.map((cue, idx) => {
    const s = Math.max(0, getCueStart(cue));
    const e = Math.max(s, getCueEnd(cue));
    return {
      ...cue,
      id: cue.id || idx + 1,
      start: s,
      end: e,
      startTime: s,
      endTime: e
    };
  });

  return {
    sequenceId: sequenceId.trim(),
    timelineStartSec: Math.max(0, timelineStartSec),
    audioDurationSec: Math.max(0, audioDurationSec),
    cues: safeCues
  };
}

/**
 * Converts audio-relative cues to Premiere timeline-positioned cues by applying
 * the sequence timeline start offset exactly once:
 * timelineTime = audioRelativeTime + timelineStartSec.
 */
export function toTimelineCues(doc: TimelineCaptionDocument): SubtitleCue[] {
  const offset = doc.timelineStartSec;
  return doc.cues.map((cue) => {
    const s = Math.round((getCueStart(cue) + offset) * 1000) / 1000;
    const e = Math.round((getCueEnd(cue) + offset) * 1000) / 1000;
    return {
      ...cue,
      start: s,
      end: e,
      startTime: s,
      endTime: e
    };
  });
}

/**
 * Converts timeline-positioned cues back to audio-relative cues
 * (e.g. when importing an existing timeline caption document).
 */
export function fromTimelineCues(
  sequenceId: string,
  timelineStartSec: number,
  audioDurationSec: number,
  timelineCues: SubtitleCue[]
): TimelineCaptionDocument {
  const offset = Math.max(0, timelineStartSec);
  const relativeCues: SubtitleCue[] = timelineCues.map((cue, idx) => {
    const relStart = Math.max(0, getCueStart(cue) - offset);
    const relEnd = Math.max(relStart, getCueEnd(cue) - offset);
    return {
      ...cue,
      id: cue.id || idx + 1,
      start: Math.round(relStart * 1000) / 1000,
      end: Math.round(relEnd * 1000) / 1000,
      startTime: Math.round(relStart * 1000) / 1000,
      endTime: Math.round(relEnd * 1000) / 1000
    };
  });

  return createTimelineCaptionDocument(
    sequenceId,
    timelineStartSec,
    audioDurationSec,
    relativeCues
  );
}

/**
 * Applies a chunk offset to cues produced by an audio chunk, keeping the resulting
 * cue times relative to the entire exported audio stream.
 */
export function applyChunkOffset(cues: SubtitleCue[], chunkStartSec: number): SubtitleCue[] {
  if (chunkStartSec <= 0) return cues;
  return cues.map((cue) => {
    const s = Math.round((getCueStart(cue) + chunkStartSec) * 1000) / 1000;
    const e = Math.round((getCueEnd(cue) + chunkStartSec) * 1000) / 1000;
    return {
      ...cue,
      start: s,
      end: e,
      startTime: s,
      endTime: e
    };
  });
}

/**
 * Verifies that the current active Premiere sequence still matches the sequence
 * the captions were created for, guarding against importing into an unintended sequence.
 */
export function verifySequenceTarget(
  originatingSequenceId: string,
  activeSequenceId: string
): { matches: boolean; message?: string } {
  if (!originatingSequenceId || !activeSequenceId) {
    return {
      matches: false,
      message: "Sequence ID is missing. Please reopen or select the target sequence."
    };
  }

  if (originatingSequenceId.trim() !== activeSequenceId.trim()) {
    return {
      matches: false,
      message: `Active sequence (${activeSequenceId}) does not match the transcription's sequence (${originatingSequenceId}).`
    };
  }

  return { matches: true };
}
