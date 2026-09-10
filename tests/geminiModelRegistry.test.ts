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


it("keeps model caches separate for keys sharing a suffix", async () => {
  const registry = new GeminiModelRegistry();
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({ models: [{ name: "models/gemini-flash-test", supportedGenerationMethods: ["generateContent"] }] }) } as Response);
  try {
    await registry.getCandidateModels("first-12345678");
    await registry.getCandidateModels("second-12345678");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  } finally { fetchMock.mockRestore(); }
});
it("propagates cancellation during model discovery", async () => {
  const controller = new AbortController();
  controller.abort(new Error("cancelled"));
  const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(controller.signal.reason);
  try {
    await expect(new GeminiModelRegistry().getCandidateModels("key", "flash", controller.signal)).rejects.toThrow("cancelled");
  } finally { fetchMock.mockRestore(); }
});
