import type { SubtitleCue } from "./srtParser";

/**
 * Re-indexes cues so their IDs are sequential 1, 2, 3...
 */
export function reindexCues(cues: SubtitleCue[]): SubtitleCue[] {
  return cues.map((cue, idx) => ({
    ...cue,
    id: idx + 1
  }));
}

/**
 * Shifts start and end times of all cues by a given offset in seconds.
 * Positive offset moves cues later; negative offset moves cues earlier (clamped at 0).
 */
export function shiftCues(cues: SubtitleCue[], offsetSeconds: number): SubtitleCue[] {
  return cues.map((cue) => {
    const start = Math.max(0, cue.start + offsetSeconds);
    const duration = Math.max(0.1, cue.end - cue.start);
    return {
      ...cue,
      start,
      end: start + duration
    };
  });
}

/**
 * Merges two adjacent cues into one continuous cue.
 */
export function mergeCues(cue1: SubtitleCue, cue2: SubtitleCue): SubtitleCue {
  return {
    id: cue1.id,
    start: Math.min(cue1.start, cue2.start),
    end: Math.max(cue1.end, cue2.end),
    text: `${cue1.text.trim()} ${cue2.text.trim()}`.trim()
  };
}

/**
 * Automatically splits a cue with long text into multiple shorter cues based on
 * a maximum characters per line (CPL) threshold.
 * It distributes the duration proportionally to the text length of each split chunk.
 */
export function splitCueByCPL(cue: SubtitleCue, maxCharsPerLine = 38): SubtitleCue[] {
  const text = cue.text.trim();
  if (text.length <= maxCharsPerLine) return [cue];

  const words = text.split(/\s+/);
  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentLength = 0;

  for (const word of words) {
    if (currentLength + word.length + (currentChunk.length > 0 ? 1 : 0) <= maxCharsPerLine) {
      currentChunk.push(word);
      currentLength += word.length + (currentChunk.length > 1 ? 1 : 0);
    } else {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.join(" "));
      }
      currentChunk = [word];
      currentLength = word.length;
    }
  }
  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join(" "));
  }

  if (chunks.length <= 1) return [cue];

  const totalDuration = Math.max(0.2, cue.end - cue.start);
  const totalChars = chunks.reduce((acc, chunk) => acc + chunk.length, 0);

  const result: SubtitleCue[] = [];
  let accumulatedTime = cue.start;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const fraction = totalChars > 0 ? chunk.length / totalChars : 1 / chunks.length;
    const chunkDuration = Math.max(0.2, totalDuration * fraction);
    const start = accumulatedTime;
    const end = i === chunks.length - 1 ? cue.end : start + chunkDuration;

    result.push({
      id: cue.id, // will be reindexed later
      start,
      end,
      text: chunk
    });
    accumulatedTime = end;
  }

  return result;
}

/**
 * Optimizes an entire array of subtitle cues by splitting any overly long cues.
 */
export function optimizeAllCues(cues: SubtitleCue[], maxCharsPerLine = 38): SubtitleCue[] {
  const optimized: SubtitleCue[] = [];
  for (const cue of cues) {
    const splits = splitCueByCPL(cue, maxCharsPerLine);
    optimized.push(...splits);
  }
  return reindexCues(optimized);
}

