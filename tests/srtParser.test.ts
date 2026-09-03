import { describe, expect, it } from "vitest";
import { generateSrt, generateVtt, parseCaptionResponse, parseSrt, parseVtt, type SubtitleCue } from "../src/core/subtitles/srtParser";

describe("srtParser", () => {
  const sampleSrt = `1
00:00:01,000 --> 00:00:03,500
ආයුබෝවන් යාලුවනේ

2
00:00:04,200 --> 00:00:07,850
අද අපි කතා කරන්නේ අලුත් වීඩියෝ එක ගැන
දෙවෙනි පේළිය`;

  it("parses valid SRT text into cues", () => {
    const cues = parseSrt(sampleSrt);
    expect(cues).toHaveLength(2);
    expect(cues[0].id).toBe(1);
    expect(cues[0].start).toBe(1);
    expect(cues[0].end).toBe(3.5);
    expect(cues[0].text).toBe("ආයුබෝවන් යාලුවනේ");

    expect(cues[1].id).toBe(2);
    expect(cues[1].start).toBe(4.2);
    expect(cues[1].end).toBe(7.85);
    expect(cues[1].text).toBe("අද අපි කතා කරන්නේ අලුත් වීඩියෝ එක ගැන\nදෙවෙනි පේළිය");
  });

  it("generates valid SRT text from cues", () => {
    const cues: SubtitleCue[] = [
      { id: 1, start: 1, end: 3.5, text: "ආයුබෝවන් යාලුවනේ" },
      { id: 2, start: 4.2, end: 7.85, text: "AutoCap Premiere Pro" }
    ];
    const srt = generateSrt(cues);
    expect(srt).toContain("1\n00:00:01,000 --> 00:00:03,500\nආයුබෝවන් යාලුවනේ");
    expect(srt).toContain("2\n00:00:04,200 --> 00:00:07,850\nAutoCap Premiere Pro");
  });

  it("generates valid WebVTT from cues", () => {
    const cues: SubtitleCue[] = [
      { id: 1, start: 0, end: 2.5, text: "First subtitle" }
    ];
    const vtt = generateVtt(cues);
    expect(vtt.startsWith("WEBVTT")).toBe(true);
    expect(vtt).toContain("00:00:00.000 --> 00:00:02.500");
  });

  it("parses WebVTT content", () => {
    const vtt = `WEBVTT

1
00:00:01.000 --> 00:00:04.000
WebVTT subtitle text`;
    const cues = parseVtt(vtt);
    expect(cues).toHaveLength(1);
    expect(cues[0].start).toBe(1);
    expect(cues[0].end).toBe(4);
    expect(cues[0].text).toBe("WebVTT subtitle text");
  });

  it("handles empty or malformed strings gracefully", () => {
    expect(parseSrt("")).toEqual([]);
    expect(parseSrt("   \n\n  ")).toEqual([]);
    expect(generateSrt([])).toBe("");
  });

  it("parses bracketed AI captions without leaking metadata into text", () => {
    const response = `[id: p_10] [00:00,432 --> 00:03,632] ආයුබෝවන් ඔබ සැමට
[id: p_11] [00:04,335 --> 00:09,115] මේ දෙවන පේළිය`;
    const cues = parseCaptionResponse(response);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toMatchObject({ start: 0.432, end: 3.632, text: "ආයුබෝවන් ඔබ සැමට" });
    expect(cues[1]).toMatchObject({ start: 4.335, end: 9.115, text: "මේ දෙවන පේළිය" });
    expect(cues.map((cue) => cue.text).join(" ")).not.toMatch(/\[id:|-->/i);
  });

  it("rejects unstructured model commentary instead of making it a caption", () => {
    expect(parseCaptionResponse("Here are your requested subtitles.")).toEqual([]);
  });

  it("parses schema-constrained Gemini JSON", () => {
    const cues = parseCaptionResponse(JSON.stringify({
      segments: [
        { start: 0.25, end: 2.5, text: "පළමු වාක්‍යය" },
        { start: 2.7, end: 5.1, text: "Second caption" }
      ]
    }));
    expect(cues).toEqual([
      { id: 1, start: 0.25, end: 2.5, text: "පළමු වාක්‍යය" },
      { id: 2, start: 2.7, end: 5.1, text: "Second caption" }
    ]);
  });
});

