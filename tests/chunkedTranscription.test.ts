import { describe, expect, it } from "vitest";
import { createSpeechAwareChunks } from "../src/services/chunkedTranscription";

function audioBuffer(duration: number, quietAt?: number): AudioBuffer {
  const sampleRate = 100;
  const samples = new Float32Array(Math.ceil(duration * sampleRate));
  samples.fill(0.1);
  if (quietAt !== undefined) {
    samples.fill(0, Math.floor((quietAt - 0.2) * sampleRate), Math.floor((quietAt + 0.2) * sampleRate));
  }
  return {
    duration,
    sampleRate,
    length: samples.length,
    numberOfChannels: 1,
    getChannelData: () => samples
  } as unknown as AudioBuffer;
}

describe("speech-aware transcription chunks", () => {
  it("keeps short audio in a single request", () => {
    expect(createSpeechAwareChunks(audioBuffer(60))).toEqual([
      { sequence: 0, start: 0, end: 60 }
    ]);
  });

  it("splits long audio near quiet boundaries with overlap", () => {
    const chunks = createSpeechAwareChunks(audioBuffer(190, 88));
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].end).toBeGreaterThanOrEqual(87.5);
    expect(chunks[0].end).toBeLessThanOrEqual(88.5);
    expect(chunks[1].start).toBeCloseTo(chunks[0].end - 1, 5);
    expect(chunks.at(-1)?.end).toBe(190);
  });
});
