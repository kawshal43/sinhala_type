/**
 * Strict schema validation and sanitization for AI-generated transcription segments.
 * Implements Section 5 of the AutoCap Product Architecture.
 */

export interface RawSegment {
  start: number | string;
  end: number | string;
  text: string;
  confidence?: number;
}

export interface ValidatedSegment {
  start: number;
  end: number;
  text: string;
  confidence?: number;
}

export interface ValidationOptions {
  chunkDuration?: number;
  maxWordsPerSecond?: number;
}

/**
 * Checks for and cleans excessive consecutive word repetitions (a common hallucination in AI models).
 * Example: "ඔව් ඔව් ඔව් ඔව් ඔව්" -> "ඔව් ඔව්"
 */
export function sanitizeRepetitions(text: string): string {
  const words = text.split(/\s+/);
  if (words.length <= 3) return text;

  const filtered: string[] = [];
  let currentWord = "";
  let repeatCount = 0;

  for (const word of words) {
    const normalized = word.toLocaleLowerCase();
    if (normalized === currentWord) {
      repeatCount++;
      if (repeatCount <= 2) {
        filtered.push(word);
      }
    } else {
      currentWord = normalized;
      repeatCount = 1;
      filtered.push(word);
    }
  }

  return filtered.join(" ");
}

/**
 * Strips markdown codeblocks, model commentary prefixes, and inline bracketed metadata.
 */
export function sanitizeText(text: string): string {
  let cleaned = text
    .replace(/^```[a-z]*\n?/gi, "")
    .replace(/\n?```$/gi, "")
    // Strip common model commentary prefixes
    .replace(/^(?:Here is the (?:transcription|transcript|subtitles?):?|Transcription:|Transcript:|Subtitles?:?)\s*/i, "")
    .replace(/^Note:\s*.*$/gim, "")
    // Strip speaker prefixes like "Speaker 1:", "[Person 1]:"
    .replace(/^(?:\[?\s*(?:Speaker|Person|Voice)\s*\d*\s*\]?\s*:)\s*/i, "")
    // Strip inline bracketed metadata like [music], [laughter], [applause]
    .replace(/\[\s*(?:music|applause|laughter|noise|silence|background noise)\s*\]/gi, "")
    // Strip residual SRT timestamp lines inside text
    .replace(/\d{1,2}:\d{2}(?::\d{2})?[,.]\d{1,3}\s*-->\s*\d{1,2}:\d{2}(?::\d{2})?[,.]\d{1,3}/g, "")
    .trim();

  // Normalize Unicode to canonical form C (NFC)
  cleaned = cleaned.normalize("NFC");

  return sanitizeRepetitions(cleaned);
}

/**
 * Validates an array of raw segments according to the architecture rules:
 * 1. end > start
 * 2. start >= 0 and within chunk bounds
 * 3. Text cannot contain timestamps or commentary
 * 4. Text cannot be empty
 * 5. Reject excessive repetition
 * 6. Reject improbable caption density (> 10 words/sec)
 * 7. Unicode normalized (NFC)
 */
export function validateAndSanitizeSegments(
  rawSegments: unknown,
  options: ValidationOptions = {}
): ValidatedSegment[] {
  if (!Array.isArray(rawSegments)) return [];

  const maxWps = options.maxWordsPerSecond ?? 10;
  const maxEnd = options.chunkDuration ? options.chunkDuration + 2.0 : Number.POSITIVE_INFINITY;
  const validated: ValidatedSegment[] = [];

  for (const item of rawSegments) {
    if (!item || typeof item !== "object") continue;
    const seg = item as Record<string, unknown>;

    const start = Number(seg.start);
    const end = Number(seg.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;

    // Rule 1: end must be strictly greater than start
    if (end <= start) continue;

    // Rule 2: start cannot be negative, end must be within bounds
    if (start < 0 || start > maxEnd) continue;
    const clampedEnd = Math.min(end, maxEnd);

    // Rule 3 & 4: clean text, reject empty
    const rawText = typeof seg.text === "string" ? seg.text : "";
    const cleanText = sanitizeText(rawText);
    if (!cleanText || cleanText.length === 0) continue;

    // Rule 6: Improbable caption density check
    const duration = Math.max(0.2, clampedEnd - start);
    const wordCount = cleanText.split(/\s+/).filter(Boolean).length;
    if (wordCount / duration > maxWps && duration < 0.8) {
      // Skip probable model glitch/hallucination with unrealistic density
      continue;
    }

    const confidence = typeof seg.confidence === "number" && Number.isFinite(seg.confidence)
      ? Math.max(0, Math.min(1, seg.confidence))
      : undefined;

    validated.push({
      start: Math.round(start * 1000) / 1000,
      end: Math.round(clampedEnd * 1000) / 1000,
      text: cleanText,
      ...(confidence !== undefined ? { confidence } : {})
    });
  }

  // Sort by start time ascending
  validated.sort((a, b) => a.start - b.start || a.end - b.end);

  return validated;
}

