import { formatSrtTime, formatVttTime, parseTimestamp } from "./timeUtils";

export interface SubtitleWord {
  word: string;
  start: number;
  end: number;
}

export interface SubtitleCue {
  id: number;
  start: number; // in seconds
  end: number;   // in seconds
  text: string;
  words?: SubtitleWord[];
}

/**
 * Parses standard SRT content into an array of SubtitleCue objects.
 */
export function parseSrt(content: string): SubtitleCue[] {
  if (!content || !content.trim()) return [];

  // Normalize line breaks
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  const blocks = normalized.split(/\n\s*\n+/);
  const cues: SubtitleCue[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const lines = blocks[i].trim().split("\n");
    if (lines.length < 2) continue;

    let timeLineIndex = 0;
    // Check if the first line is the numeric index
    if (/^\d+$/.test(lines[0].trim()) && lines.length >= 2) {
      timeLineIndex = 1;
    }

    const timeLine = lines[timeLineIndex];
    if (!timeLine || !timeLine.includes("-->")) continue;

    const [startStr, endStr] = timeLine.split("-->").map((s) => s.trim());
    const start = parseTimestamp(startStr);
    const end = parseTimestamp(endStr);

    const textLines = lines.slice(timeLineIndex + 1);
    const text = textLines.join("\n").trim();

    cues.push({
      id: cues.length + 1,
      start,
      end: Math.max(start, end),
      text
    });
  }

  return cues;
}

/**
 * Parses WebVTT content into an array of SubtitleCue objects.
 */
export function parseVtt(content: string): SubtitleCue[] {
  if (!content || !content.trim()) return [];

  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  // Strip optional WEBVTT header and metadata
  const withoutHeader = normalized.replace(/^WEBVTT[^\n]*\n+/i, "");
  const blocks = withoutHeader.split(/\n\s*\n+/);
  const cues: SubtitleCue[] = [];

  for (const block of blocks) {
    const lines = block.trim().split("\n");
    if (lines.length === 0) continue;

    let timeLineIndex = 0;
    if (!lines[0].includes("-->") && lines.length > 1 && lines[1].includes("-->")) {
      timeLineIndex = 1;
    }

    const timeLine = lines[timeLineIndex];
    if (!timeLine || !timeLine.includes("-->")) continue;

    const [startStr, endPart] = timeLine.split("-->").map((s) => s.trim());
    // WebVTT may have positioning cues after the timestamp (e.g. "00:00:05.000 align:start")
    const endStr = endPart.split(/\s+/)[0];

    const start = parseTimestamp(startStr);
    const end = parseTimestamp(endStr);

    const textLines = lines.slice(timeLineIndex + 1);
    const text = textLines.join("\n").trim();

    cues.push({
      id: cues.length + 1,
      start,
      end: Math.max(start, end),
      text
    });
  }

  return cues;
}

/**
 * Generates valid SubRip (.srt) format from an array of subtitle cues.
 */
export function generateSrt(cues: SubtitleCue[]): string {
  if (!cues || cues.length === 0) return "";

  return cues
    .map((cue, index) => {
      const id = index + 1;
      const startTime = formatSrtTime(cue.start);
      const endTime = formatSrtTime(cue.end);
      const text = (cue.text || "").trim();
      return `${id}\n${startTime} --> ${endTime}\n${text}`;
    })
    .join("\n\n") + "\n";
}

/**
 * Generates valid WebVTT (.vtt) format from an array of subtitle cues.
 */
export function generateVtt(cues: SubtitleCue[]): string {
  let vtt = "WEBVTT\n\n";
  if (!cues || cues.length === 0) return vtt;

  vtt += cues
    .map((cue, index) => {
      const id = index + 1;
      const startTime = formatVttTime(cue.start);
      const endTime = formatVttTime(cue.end);
      const text = (cue.text || "").trim();
      return `${id}\n${startTime} --> ${endTime}\n${text}`;
    })
    .join("\n\n") + "\n";

  return vtt;
}

