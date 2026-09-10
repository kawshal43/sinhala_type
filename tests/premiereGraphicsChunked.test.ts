import { describe, it, expect, vi } from "vitest";
import { premiereGraphicsClient, resolveDefaultMogrtPath } from "../src/platform/premiereGraphics";
import type { CaptionGraphicsRequest, ChunkedGraphicsProgress } from "../src/platform/premiereHostTypes";

describe("premiereGraphicsClient chunked batch insertion", () => {
  it("resolves default template path when CSInterface is mocked", () => {
    (global as any).window = {
      __adobe_cep__: true,
      CSInterface: function () {
        return {
          getSystemPath: (kind: string) => (kind === "extension" ? "C:/Users/Test/AutoCap" : "")
        };
      }
    };

    const resolved = resolveDefaultMogrtPath();
    expect(resolved).toBe("C:/Users/Test/AutoCap/assets/AutoCapCaption.mogrt");
    delete (global as any).window;
  });

  it("handles batch slicing and calls onProgress correctly in browser demo mode", async () => {
    const cues = Array.from({ length: 12 }, (_, i) => ({
      id: i + 1,
      start: i * 2,
      end: i * 2 + 1.8,
      text: "Caption #" + (i + 1)
    }));

    const progressReports: ChunkedGraphicsProgress[] = [];
    const request: CaptionGraphicsRequest = {
      sequenceId: "demo_seq",
      timelineStartSec: 0,
      targetVideoTrackIndex: 1,
      cues
    };

    const res = await premiereGraphicsClient.insertAllCaptionGraphicsChunked(request, {
      batchSize: 4,
      onProgress: (p) => progressReports.push(p)
    });

    expect(res.success).toBe(true);
    expect(res.insertedCount).toBe(12);
    expect(progressReports.length).toBe(3);
    expect(progressReports[0].inserted).toBe(4);
    expect(progressReports[1].inserted).toBe(8);
    expect(progressReports[2].inserted).toBe(12);
    expect(progressReports[2].percentage).toBe(100);
  });

  it("cancels insertion early when AbortSignal is triggered", async () => {
    const cues = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      start: i * 2,
      end: i * 2 + 1.5,
      text: "Caption " + (i + 1)
    }));

    const controller = new AbortController();
    const progressReports: ChunkedGraphicsProgress[] = [];

    const request: CaptionGraphicsRequest = {
      sequenceId: "seq_cancel",
      timelineStartSec: 0,
      targetVideoTrackIndex: 2,
      cues
    };

    const promise = premiereGraphicsClient.insertAllCaptionGraphicsChunked(request, {
      batchSize: 2,
      signal: controller.signal,
      onProgress: (p) => {
        progressReports.push(p);
        if (p.currentBatch === 2) {
          controller.abort();
        }
      }
    });

    const res = await promise;
    expect(res.success).toBe(false);
    expect(res.code).toBe("ABORTED");
    expect(res.insertedCount).toBeLessThan(10);
    expect(res.message).toContain("Cancelled");
  });

  it("rejects empty cue sets and negative track indexes", async () => {
    const resEmpty = await premiereGraphicsClient.insertAllCaptionGraphicsChunked({
      sequenceId: "seq",
      timelineStartSec: 0,
      targetVideoTrackIndex: 0,
      cues: []
    });
    expect(resEmpty.success).toBe(false);
    expect(resEmpty.code).toBe("NO_CUES");

    const resTrack = await premiereGraphicsClient.insertAllCaptionGraphicsChunked({
      sequenceId: "seq",
      timelineStartSec: 0,
      targetVideoTrackIndex: -1,
      cues: [{ id: 1, start: 0, end: 2, text: "Sample" }]
    });
    expect(resTrack.success).toBe(false);
    expect(resTrack.code).toBe("INVALID_TRACK");
  });
});
