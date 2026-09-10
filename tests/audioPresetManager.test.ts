import { describe, expect, it } from "vitest";
import { AudioPresetManager, validateWavPresetContent } from "../src/services/audioPresetManager";

describe("AudioPresetManager", () => {
  it("validates preset file extensions correctly", () => {
    const manager = new AudioPresetManager();

    expect(manager.validatePreset("").valid).toBe(false);
    expect(manager.validatePreset("preset.txt").valid).toBe(false);
    expect(manager.validatePreset("C:/Presets/ExportWav.epr").valid).toBe(true);
  });

  it("persists and retrieves selected preset path", () => {
    const manager = new AudioPresetManager();
    const testPath = "C:/Presets/MyCustomAudio.epr";

    manager.setSelectedPresetPath(testPath);
    expect(manager.getSelectedPresetPath()).toBe(testPath);
  });

  it("accepts only audio-only Waveform Audio presets", () => {
    const wavPreset = `
      <PremiereData Version="3">
        <ExporterFileType>1463899717</ExporterFileType>
        <DoAudio>true</DoAudio>
        <DoVideo>false</DoVideo>
      </PremiereData>`;
    expect(validateWavPresetContent(wavPreset).valid).toBe(true);

    const aacVideoPreset = `
      <PremiereData Version="3">
        <DoAudio>true</DoAudio>
        <DoVideo>true</DoVideo>
        <ParamAuxValue>AAC</ParamAuxValue>
      </PremiereData>`;
    expect(validateWavPresetContent(aacVideoPreset).valid).toBe(false);
  });

  it("rejects audio-only AAC because AutoCap writes a WAV output", () => {
    const result = validateWavPresetContent(`
      <DoAudio>true</DoAudio>
      <DoVideo>false</DoVideo>
      <ParamAuxValue>AAC</ParamAuxValue>`);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/Waveform/i);
  });
});
