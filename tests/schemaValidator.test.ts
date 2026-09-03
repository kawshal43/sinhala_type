import { describe, expect, it } from "vitest";
import {
  sanitizeRepetitions,
  sanitizeText,
  validateAndSanitizeSegments
} from "../src/core/subtitles/schemaValidator";

describe("schemaValidator", () => {
  it("sanitizes excessive word repetitions", () => {
    const raw = "ඔව් ඔව් ඔව් ඔව් ඔව් මම ආවා";
    const cleaned = sanitizeRepetitions(raw);
    expect(cleaned).toBe("ඔව් ඔව් මම ආවා");
  });

  it("strips markdown code blocks, speaker labels, and metadata", () => {
    const raw = "```\nSpeaker 1: [music] ආයුබෝවන් හැමෝටම.\n```";
    const cleaned = sanitizeText(raw);
    expect(cleaned).toBe("ආයුබෝවන් හැමෝටම.");
  });

  it("validates segments against architecture rules", () => {
    const rawSegments = [
      { start: 0, end: 2.5, text: "පළමු පේළිය" },
      { start: 3.0, end: 2.0, text: "invalid end before start" }, // should be rejected
      { start: -1, end: 2.0, text: "negative start" }, // should be rejected
      { start: 4.0, end: 6.0, text: "   " }, // empty text rejected
      { start: 7.0, end: 10.0, text: "දෙවන පේළිය", confidence: 0.95 }
    ];

    const validated = validateAndSanitizeSegments(rawSegments, { chunkDuration: 12.0 });
    expect(validated.length).toBe(2);
    expect(validated[0].text).toBe("පළමු පේළිය");
    expect(validated[1].text).toBe("දෙවන පේළිය");
    expect(validated[1].confidence).toBe(0.95);
  });

  it("normalizes Sinhala Unicode to NFC", () => {
    const rawText = "සිංහල"; // Unicode text
    const validated = validateAndSanitizeSegments([{ start: 0, end: 1, text: rawText }]);
    expect(validated[0].text).toBe(rawText.normalize("NFC"));
  });
});

