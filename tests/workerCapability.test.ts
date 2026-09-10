import { expect, it } from "vitest";
import { canProcessTranscription } from "../src/services/localWorkerClient";
it("rejects the unfinished worker even when FFmpeg is available", () => {
  const health = { status: "ok", worker: "autocap-local-worker", version: "1.3.1", ffmpegAvailable: true };
  expect(canProcessTranscription(health)).toBe(false);
  expect(canProcessTranscription({ ...health, capabilities: { transcription: false } })).toBe(false);
  expect(canProcessTranscription({ ...health, capabilities: { transcription: true } })).toBe(true);
});
