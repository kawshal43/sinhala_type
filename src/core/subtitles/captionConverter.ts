import { unicodeToDlManel } from "sinhala-unicode-coverter";
import { unicodeToIsi } from "../isiConverter";
import type { SubtitleCue } from "./srtParser";

export type CaptionEncoding = "unicode" | "wije" | "isi";

/**
 * Checks if a string contains Sinhala characters (Unicode range U+0D80 to U+0DFF).
 */
export function isSinhalaText(text: string): boolean {
  if (!text) return false;
  return /[\u0D80-\u0DFF]/.test(text);
}

/**
 * Converts a single text string from Unicode Sinhala to target encoding.
 */
export function convertCaptionText(text: string, targetEncoding: CaptionEncoding): string {
  if (targetEncoding === "wije") {
    return unicodeToDlManel(text);
  }
  if (targetEncoding === "isi") {
    return unicodeToIsi(text);
  }
  return text;
}

/**
 * Converts all cues in a subtitle set from Unicode to target encoding (Unicode, Wije, or ISI).
 */
export function convertSubtitleCues(cues: SubtitleCue[], targetEncoding: CaptionEncoding): SubtitleCue[] {
  if (targetEncoding === "unicode") {
    return cues;
  }

  return cues.map((cue) => ({
    ...cue,
    text: convertCaptionText(cue.text, targetEncoding)
  }));
}

export interface FontTestSample {
  label: string;
  unicode: string;
  display: string;
}

/**
 * Returns a collection of standard Sinhala font test words (testing conjuncts,
 * repaya, rakaransaya, and modern words) converted to the requested encoding.
 */
export function getSinhalaFontTestSamples(targetEncoding: CaptionEncoding): FontTestSample[] {
  const baseSamples = [
    { label: "Conjunct (අම්මා)", unicode: "අම්මා" },
    { label: "Repaya (ශ්‍රී ලංකා)", unicode: "ශ්‍රී ලංකා" },
    { label: "Rakaransaya (ප්‍රවෘත්ති)", unicode: "ප්‍රවෘත්ති" },
    { label: "Modern (වීඩියෝ)", unicode: "වීඩියෝ" }
  ];

  return baseSamples.map((sample) => ({
    label: sample.label,
    unicode: sample.unicode,
    display: convertCaptionText(sample.unicode, targetEncoding)
  }));
}
