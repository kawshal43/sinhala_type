import { describe, expect, it, beforeEach } from "vitest";
import {
  clearIncompleteJob,
  getIncompleteJob,
  saveIncompleteJob
} from "../src/services/jobRecovery";

describe("jobRecovery", () => {
  const mockKey = "test-job-key-123";

  beforeEach(() => {
    clearIncompleteJob(mockKey);
  });

  it("saves, retrieves, and clears an incomplete job record", () => {
    expect(getIncompleteJob(mockKey)).toBeNull();

    saveIncompleteJob({
      cacheKey: mockKey,
      totalChunks: 5,
      completedChunks: {
        0: {
          cues: [{ id: 1, start: 0, end: 2, text: "ආයුබෝවන්" }],
          providerUsed: "Google Gemini",
          isSinhala: true
        }
      },
      cues: [{ id: 1, start: 0, end: 2, text: "ආයුබෝවන්" }],
      updatedAt: Date.now()
    });

    const restored = getIncompleteJob(mockKey);
    expect(restored).not.toBeNull();
    expect(restored?.totalChunks).toBe(5);
    expect(restored?.completedChunks[0].cues[0].text).toBe("ආයුබෝවන්");

    clearIncompleteJob(mockKey);
    expect(getIncompleteJob(mockKey)).toBeNull();
  });
});

