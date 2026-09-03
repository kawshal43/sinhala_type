import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  uploadToGeminiFilesApi,
  deleteGeminiFile,
  GEMINI_FILES_API_THRESHOLD_BYTES
} from "../src/services/geminiFilesApi";

describe("geminiFilesApi", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("has a sensible threshold for large files", () => {
    expect(GEMINI_FILES_API_THRESHOLD_BYTES).toBe(4 * 1024 * 1024);
  });

  it("uploads a file successfully using resumable protocol", async () => {
    const mockBlob = new Blob(["fake-audio-bytes"], { type: "audio/flac" });

    global.fetch = vi.fn()
      // 1. Initiation response
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => (name.toLowerCase() === "x-goog-upload-url" ? "https://upload.example.com/session123" : null)
        }
      } as any)
      // 2. Upload response
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          file: {
            name: "files/abc456",
            uri: "https://generativelanguage.googleapis.com/v1beta/files/abc456",
            mimeType: "audio/flac",
            sizeBytes: "16"
          }
        })
      } as any);

    const result = await uploadToGeminiFilesApi(mockBlob, "audio/flac", "test-api-key", "test.flac");

    expect(result.name).toBe("files/abc456");
    expect(result.uri).toBe("https://generativelanguage.googleapis.com/v1beta/files/abc456");
    expect(result.mimeType).toBe("audio/flac");
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("handles deleteGeminiFile correctly", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200
    } as any);

    const deleted = await deleteGeminiFile("files/abc456", "test-api-key");
    expect(deleted).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://generativelanguage.googleapis.com/v1beta/files/abc456?key=test-api-key",
      { method: "DELETE" }
    );
  });
});

