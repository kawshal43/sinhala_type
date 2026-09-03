import { describe, expect, it } from "vitest";
import {
  calculateWindowRms,
  findSilenceBoundary
} from "../src/core/vad/speechDetector";

describe("speechDetector VAD", () => {
  function createMockBuffer(samples: number[], sampleRate = 16000): AudioBuffer {
    const floatArray = new Float32Array(samples);
    return {
      numberOfChannels: 1,
      sampleRate,
      length: samples.length,
      duration: samples.length / sampleRate,
      getChannelData: () => floatArray
    } as unknown as AudioBuffer;
  }

  it("calculates short window RMS energy", () => {
    // 1 second buffer: 0.5s silence, 0.5s loud tone (amplitude 0.8)
    const samples = new Array(16000).fill(0);
    for (let i = 8000; i < 16000; i++) {
      samples[i] = 0.8;
    }
    const buffer = createMockBuffer(samples, 16000);

    const silenceRms = calculateWindowRms(buffer, 0.2);
    const speechRms = calculateWindowRms(buffer, 0.7);

    expect(silenceRms).toBe(0);
    expect(speechRms).toBeGreaterThan(0.7);
  });

  it("finds optimal silence boundary near target time", () => {
    // 30-second buffer with silence dip at 15.0 seconds
    const sampleRate = 1000; // 1000 samples per second for test
    const samples = new Array(30 * sampleRate).fill(0.5); // sound everywhere
    // inject silence dip between 14.5s and 15.5s
    for (let i = 14500; i < 15500; i++) {
      samples[i] = 0.001;
    }
    const buffer = createMockBuffer(samples, sampleRate);

    const boundary = findSilenceBoundary(buffer, 14.0, 10.0, 20.0);
    // Should locate the silence dip around 14.5 - 15.0 seconds
    expect(boundary).toBeGreaterThanOrEqual(14.0);
    expect(boundary).toBeLessThanOrEqual(16.0);
  });
});

