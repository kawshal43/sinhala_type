import { describe, expect, it } from "vitest";
import {
  audioBufferToWavBlob,
  exportSubtitleFile,
  getSequenceAudioTracks,
  importSubtitlesIntoPremiere,
  loadMediaFileFromPath,
  prepareMediaForTranscription
} from "../src/platform/premiereBridge";

describe("premiereBridge media loading", () => {
  it("loads fallback blob in test browser environment without throwing Invalid character", async () => {
    const result = await loadMediaFileFromPath("C:/dummy/test_track.wav");
    expect(result).toBeDefined();
    expect(result.filename).toBe("test_track.wav");
    expect(result.blob).toBeDefined();
    expect(result.blob.type).toBe("audio/wav");
    expect(result.blob.size).toBeGreaterThan(0);
  });

  it("throws error for empty path", async () => {
    await expect(loadMediaFileFromPath("")).rejects.toThrowError(/Media path is empty/);
  });

  it("falls back safely when local FFmpeg preprocessing is unavailable", async () => {
    const result = await prepareMediaForTranscription("C:/dummy/test_track.wav");
    expect(result.optimized).toBe(false);
    expect(result.preparedBytes).toBeGreaterThan(0);
    expect(result.preparationMs).toBeGreaterThanOrEqual(0);
  });

  it("returns demo sequence tracks and timeline selection in browser mode", async () => {
    const info = await getSequenceAudioTracks();
    expect(info.sequenceName).toBe("Demo Sequence");
    expect(info.tracks.length).toBeGreaterThan(0);
    expect(info.selectedClips).toBeDefined();
    expect(info.selectedClips?.length).toBe(1);
    expect(info.tracks[0].clips.length).toBe(2);
  });

  it("exports subtitle file in browser fallback mode", async () => {
    const res = await exportSubtitleFile("1\n00:00:01,000 --> 00:00:03,000\nHello", "test.srt", "srt");
    expect(res.success).toBe(true);
    expect(res.message).toContain("test.srt");
  });

  it("imports subtitles into Premiere Pro with browser fallback", async () => {
    const res = await importSubtitlesIntoPremiere("1\n00:00:01,000 --> 00:00:03,000\nHello", "AutoCap_test.srt");
    expect(res.success).toBe(true);
    expect(res.message).toContain("Premiere Pro");
  });

  it("generates a valid WAV blob from an AudioBuffer-like data structure", () => {
    // Mock an AudioBuffer
    const mockChannel = new Float32Array(100);
    for (let i = 0; i < 100; i++) mockChannel[i] = Math.sin(i * 0.1);
    const mockBuffer = {
      numberOfChannels: 1,
      sampleRate: 44100,
      length: 100,
      duration: 100 / 44100,
      getChannelData: () => mockChannel
    } as unknown as AudioBuffer;

    const wavBlob = audioBufferToWavBlob(mockBuffer);
    expect(wavBlob).toBeDefined();
    expect(wavBlob.type).toBe("audio/wav");
    // 44 bytes header + 100 * 2 bytes = 244 bytes
    expect(wavBlob.size).toBe(244);
  });
});
