import { describe, expect, it, vi } from "vitest";
import { GeminiModelRegistry, type GeminiModelInfo } from "../src/services/geminiModelRegistry";

describe("GeminiModelRegistry", () => {
  const sampleModels: GeminiModelInfo[] = [
    { name: "gemini-1.5-pro", displayName: "Gemini 1.5 Pro", supportedGenerationMethods: ["generateContent"] },
    { name: "gemini-2.0-flash", displayName: "Gemini 2.0 Flash", supportedGenerationMethods: ["generateContent"] },
    { name: "gemini-1.5-flash", displayName: "Gemini 1.5 Flash", supportedGenerationMethods: ["generateContent"] },
    { name: "gemini-2.0-flash-lite", displayName: "Gemini 2.0 Flash Lite", supportedGenerationMethods: ["generateContent"] }
  ];

  it("ranks flash models first when flash preference is active", () => {
    const registry = new GeminiModelRegistry();
    const ranked = registry.rankModels(sampleModels, "flash");

    expect(ranked[0]).toContain("flash");
    expect(ranked.indexOf("gemini-1.5-pro")).toBeGreaterThan(ranked.indexOf("gemini-2.0-flash"));
  });

  it("ranks pro models first when pro preference is active", () => {
    const registry = new GeminiModelRegistry();
    const ranked = registry.rankModels(sampleModels, "pro");

    expect(ranked[0]).toContain("pro");
  });

  it("prioritizes the last successful model at the top", () => {
    const registry = new GeminiModelRegistry();
    const ranked = registry.rankModels(sampleModels, "flash", "gemini-1.5-flash");

    expect(ranked[0]).toBe("gemini-1.5-flash");
  });

  it("returns fallback default models when discovery throws or key is missing", async () => {
    const registry = new GeminiModelRegistry();
    const defaults = await registry.getCandidateModels("");

    expect(defaults.length).toBeGreaterThan(0);
    expect(defaults).toContain("gemini-2.0-flash");
  });
});
