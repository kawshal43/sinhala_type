import { describe, expect, it } from "vitest";
import { createTranscriptCacheKey, getCachedTranscript } from "../src/storage/transcriptCache";
import type { AppSettings } from "../src/storage/appSettings";

const settings: AppSettings = {
  sttProvider: "gemini",
  groqApiKey: "",
  openaiApiKey: "",
  geminiApiKey: "not-part-of-cache-key",
  language: "si",
  defaultEncoding: "unicode",
  maxCpl: 38
};

describe("transcript cache", () => {
  it("creates stable keys without exposing API keys", async () => {
    const file = new Blob(["audio-data"]);
    const first = await createTranscriptCacheKey(file, settings);
    const second = await createTranscriptCacheKey(file, settings);
    expect(first).toBe(second);
    expect(first).not.toContain(settings.geminiApiKey);
  });

  it("degrades safely when IndexedDB is unavailable", async () => {
    await expect(getCachedTranscript("missing")).resolves.toBeNull();
  });
});
