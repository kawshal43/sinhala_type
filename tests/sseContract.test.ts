import { describe, it, expect } from "vitest";
import {
  formatSseMessage,
  parseSseData,
  type AutoCapSseEvent
} from "../src/core/sse/sseContract";

describe("SSE Contract", () => {
  it("formats and parses a job_created event", () => {
    const event: AutoCapSseEvent = {
      type: "job_created",
      jobId: "job_123",
      totalDuration: 180,
      estimatedChunks: 2
    };

    const formatted = formatSseMessage(event);
    expect(formatted).toContain("event: job_created\n");
    expect(formatted).toContain('"jobId":"job_123"');

    const lines = formatted.split("\n");
    const dataLine = lines.find((l) => l.startsWith("data: "))!.slice(6);
    const parsed = parseSseData(dataLine);
    expect(parsed).toEqual(event);
  });

  it("formats and parses a cue event", () => {
    const event: AutoCapSseEvent = {
      type: "cue",
      jobId: "job_123",
      chunkIndex: 0,
      cue: {
        id: 1,
        start: 0.5,
        end: 3.2,
        text: "ආයුබෝවන් සුබ දවසක්"
      }
    };

    const formatted = formatSseMessage(event);
    expect(formatted).toContain("event: cue\n");

    const lines = formatted.split("\n");
    const dataLine = lines.find((l) => l.startsWith("data: "))!.slice(6);
    const parsed = parseSseData(dataLine);
    expect(parsed?.type).toBe("cue");
    if (parsed?.type === "cue") {
      expect(parsed.cue.text).toBe("ආයුබෝවන් සුබ දවසක්");
    }
  });

  it("returns null for invalid data", () => {
    expect(parseSseData("invalid json")).toBeNull();
  });
});

