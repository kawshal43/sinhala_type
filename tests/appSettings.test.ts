import { describe, it, expect, beforeEach } from "vitest";
import { loadSettings, saveSettings, type AppSettings } from "../src/storage/appSettings";

describe("AppSettings multi-tier storage", () => {
  beforeEach(() => {
    if (typeof localStorage !== "undefined") {
      localStorage.clear();
    }
  });

  it("loads default settings when empty", () => {
    const settings = loadSettings();
    expect(settings).toBeDefined();
    expect(settings.sttProvider).toBe("gemini");
    expect(settings.maxCpl).toBe(38);
  });

  it("saves and reloads Gemini API key correctly", () => {
    const original = loadSettings();
    const updated: AppSettings = {
      ...original,
      geminiApiKey: "AIzaSyTestApiKey12345",
      groqApiKey: "gsk_testGroqKey"
    };

    saveSettings(updated);

    const reloaded = loadSettings();
    expect(reloaded.geminiApiKey).toBe("AIzaSyTestApiKey12345");
    expect(reloaded.groqApiKey).toBe("gsk_testGroqKey");
  });

  it("persists across re-calls to loadSettings", () => {
    const settings = loadSettings();
    settings.geminiApiKey = "AIzaSyPermanentKey";
    saveSettings(settings);

    const check = loadSettings();
    expect(check.geminiApiKey).toBe("AIzaSyPermanentKey");
  });
});

