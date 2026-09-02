import { describe, expect, it } from "vitest";
import { loadMediaFileFromPath } from "../src/platform/premiereBridge";

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
});

