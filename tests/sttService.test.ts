import { describe, expect, it } from "vitest";
import { resolveAutoProvider } from "../src/services/sttService";
import type { AppSettings } from "../src/storage/appSettings";

describe("sttService", () => {
  const baseSettings: AppSettings = {
    sttProvider: "auto",
    groqApiKey: "",
    openaiApiKey: "",
    geminiApiKey: "",
    language: "auto",
    defaultEncoding: "unicode",
    maxCpl: 38
  };

  it("resolves Gemini as priority when geminiApiKey is set", () => {
    const settings = { ...baseSettings, geminiApiKey: "AIza_test123" };
    const resolved = resolveAutoProvider(settings);
    expect(resolved.provider).toBe("gemini");
    expect(resolved.label).toContain("Gemini 3.6 Flash");
  });

  it("resolves Groq when only groqApiKey is set", () => {
    const settings = { ...baseSettings, groqApiKey: "gsk_test123" };
    const resolved = resolveAutoProvider(settings);
    expect(resolved.provider).toBe("groq");
    expect(resolved.label).toContain("Groq");
  });

  it("resolves OpenAI when only openaiApiKey is set", () => {
    const settings = { ...baseSettings, openaiApiKey: "sk_test123" };
    const resolved = resolveAutoProvider(settings);
    expect(resolved.provider).toBe("openai");
    expect(resolved.label).toContain("OpenAI");
  });

  it("throws descriptive error when no keys are configured", () => {
    expect(() => resolveAutoProvider(baseSettings)).toThrowError(/No AI API keys configured/);
  });
});
