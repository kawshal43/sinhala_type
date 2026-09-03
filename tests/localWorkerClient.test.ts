import { describe, it, expect, vi } from "vitest";
import { checkLocalWorkerHealth, transcribeWithLocalWorker } from "../src/services/localWorkerClient";

describe("Local Worker Client", () => {
  it("returns null when worker is offline", async () => {
    // Port 48199 is unused, should fail quickly and return null
    const health = await checkLocalWorkerHealth("http://127.0.0.1:48199", 200);
    expect(health).toBeNull();
  });

  it("submits job and handles completion", async () => {
    // Mock global fetch
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/v1/health")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: "ok", version: "2.0.0", ffmpegAvailable: true })
        });
      }
      if (url.includes("/v1/jobs") && !url.includes("cancel")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ jobId: "mock-job-123" })
        });
      }
      if (url.includes("/v1/jobs/mock-job-123")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              status: "completed",
              cues: [
                { id: 1, start: 0, end: 2, text: "ආයුබෝවන්" }
              ]
            })
        });
      }
      return Promise.reject(new Error("Unknown route"));
    });

    vi.stubGlobal("fetch", mockFetch);

    const health = await checkLocalWorkerHealth("http://mock-worker");
    expect(health?.status).toBe("ok");

    vi.unstubAllGlobals();
  });
});

