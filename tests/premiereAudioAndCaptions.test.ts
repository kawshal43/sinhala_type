import { describe, expect, it } from "vitest";
import { premiereCaptionsClient } from "../src/platform/premiereCaptions";
import { premiereAudioClient } from "../src/platform/premiereAudio";
import { premiereGraphicsClient } from "../src/platform/premiereGraphics";
import type { TimelineCaptionDocument } from "../src/platform/premiereHostTypes";

describe("premiereAudioAndCaptions in non-CEP (browser / node) mode", () => {
  it("exports audio mock in browser mode cleanly", async () => {
    const res = await premiereAudioClient.exportTimelineAudio(
      { kind: "range", sequenceId: "seq_test", startSec: 10, endSec: 25 },
      "test_job"
    );

    expect(res.jobId).toBe("test_job");
    expect(res.durationSec).toBe(15);
    expect(res.timelineStartSec).toBe(10);
    expect(res.temporary).toBe(true);
  });

  it("handles empty or invalid caption import requests gracefully", async () => {
    const emptyDoc: TimelineCaptionDocument = {
      sequenceId: "seq_1",
      timelineStartSec: 0,
      audioDurationSec: 10,
      cues: []
    };

    const res = await premiereCaptionsClient.importCaptionDocument(emptyDoc);
    expect(res.status).toBe("failed");
    expect(res.code).toBe("NO_CUES");
  });

  it("handles MOGRT validation for empty text", async () => {
    const res = await premiereGraphicsClient.insertGraphic({
      sequenceId: "seq_1",
      templatePath: "C:/Templates/lower_third.mogrt",
      text: "   ",
      encoding: "unicode",
      targetVideoTrackIndex: 1,
      durationSec: 3.5
    });

    expect(res.success).toBe(false);
    expect(res.code).toBe("EMPTY_TEXT");
  });

  it("simulates MOGRT insertion in non-CEP mode with converted text", async () => {
    const res = await premiereGraphicsClient.insertGraphic({
      sequenceId: "seq_1",
      templatePath: "C:/Templates/lower_third.mogrt",
      text: "ආයුබෝවන්",
      encoding: "unicode",
      targetVideoTrackIndex: 1,
      durationSec: 4.0
    });

    expect(res.success).toBe(true);
    expect(res.appliedText).toBe("ආයුබෝවන්");
  });
});
