import { describe, expect, it, vi } from "vitest";
import {
  TranscriptionJobController,
  type ExportAudioFunction
} from "../src/services/transcriptionJob";
import type { AudioSourceRequest, PreparedTimelineAudio } from "../src/platform/premiereHostTypes";
import type { AppSettings } from "../src/storage/appSettings";
import * as chunkedModule from "../src/services/chunkedTranscription";

describe("TranscriptionJobController", () => {
  const defaultSettings: AppSettings = {
    sttProvider: "gemini",
    groqApiKey: "",
    openaiApiKey: "",
    geminiApiKey: "fake_key",
    language: "auto",
    defaultEncoding: "unicode",
    maxCpl: 38
  };

  const dummyRequest: AudioSourceRequest = {
    kind: "sequence",
    sequenceId: "seq-test-1"
  };

  const mockPreparedAudio: PreparedTimelineAudio = {
    jobId: "job-1",
    sequenceId: "seq-test-1",
    audioPath: "C:/Temp/audio.wav",
    durationSec: 10,
    timelineStartSec: 5,
    temporary: true
  };

  it("advances through states and returns a valid TimelineCaptionDocument", async () => {
    const controller = new TranscriptionJobController();
    const stagesRecorded: string[] = [];

    // Mock chunked transcription
    vi.spyOn(chunkedModule, "transcribeAudioChunked").mockResolvedValueOnce({
      cues: [{ id: 1, start: 1, end: 3, startTime: 1, endTime: 3, text: "ආයුබෝවන්" }],
      providerUsed: "gemini",
      detectedLanguage: "si",
      isSinhala: true
    });

    const mockExport: ExportAudioFunction = async (req, jId, signal) => {
      return { ...mockPreparedAudio, jobId: jId };
    };

    const doc = await controller.executeJob(
      dummyRequest,
      defaultSettings,
      mockExport,
      {
        onProgress: (p) => stagesRecorded.push(p.stage)
      }
    );

    expect(controller.getStage()).toBe("ready");
    expect(doc.sequenceId).toBe("seq-test-1");
    expect(doc.timelineStartSec).toBe(5);
    expect(doc.cues.length).toBe(1);
    expect(doc.cues[0].text).toBe("ආයුබෝවන්");
    expect(stagesRecorded).toContain("inspecting");
    expect(stagesRecorded).toContain("exporting");
    expect(stagesRecorded).toContain("transcribing");
    expect(stagesRecorded).toContain("validating");
    expect(stagesRecorded).toContain("ready");
  });

  it("handles user cancellation cleanly", async () => {
    const controller = new TranscriptionJobController();

    const mockExport: ExportAudioFunction = async (req, jId, signal) => {
      // Trigger cancel mid-export
      controller.cancelActiveJob();
      if (signal.aborted) throw new Error("Job cancelled.");
      return { ...mockPreparedAudio, jobId: jId };
    };

    await expect(
      controller.executeJob(dummyRequest, defaultSettings, mockExport)
    ).rejects.toThrow(/cancelled/i);

    expect(controller.getStage()).toBe("cancelled");
    expect(controller.isBusy()).toBe(false);
  });

  it("validates worker eligibility and rejects non-conforming workers", () => {
    const controller = new TranscriptionJobController();

    expect(controller.canWorkerProcessRealJobs(null)).toBe(false);
    expect(
      controller.canWorkerProcessRealJobs({
        status: "ok",
        version: "1.3.1",
        worker: "other-worker",
        ffmpegAvailable: true
      })
    ).toBe(false);
    expect(
      controller.canWorkerProcessRealJobs({
        status: "ok",
        version: "1.3.1",
        worker: "autocap-local-worker",
        ffmpegAvailable: false
      })
    ).toBe(false);
    expect(
      controller.canWorkerProcessRealJobs({
        status: "ok",
        version: "1.3.1",
        worker: "autocap-local-worker",
        capabilities: { transcription: true },
        ffmpegAvailable: true
      })
    ).toBe(true);
  });
});
