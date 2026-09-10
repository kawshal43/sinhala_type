import { describe, expect, it } from "vitest";
import { AudioPresetManager } from "../src/services/audioPresetManager";

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
});
