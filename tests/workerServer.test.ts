import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import { createWorkerServer, startWorkerServer, isFfmpegAvailable } from "../src/worker/workerServer";

describe("workerServer daemon", () => {
  let server: http.Server;
  let testPort: number;

  beforeAll(async () => {
    // Pick an ephemeral port for testing
    const started = await startWorkerServer(0);
    server = started.server;
    const addr = server.address() as any;
    testPort = addr.port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("checks ffmpeg availability", () => {
    expect(typeof isFfmpegAvailable()).toBe("boolean");
  });

  it("responds to GET /v1/health with 200 OK and health status", async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/v1/health`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("ok");
    expect(data.worker).toBe("autocap-local-worker");
    expect(data.version).toBe("1.3.1");
  });

  it("accepts job creation via POST /v1/jobs", async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/v1/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mediaPath: "C:/test/sample.wav",
        language: "si"
      })
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.jobId).toBeDefined();
    expect(data.jobId).toContain("job_");

    // Cancel the job
    const cancelRes = await fetch(`http://127.0.0.1:${testPort}/v1/jobs/${data.jobId}/cancel`, {
      method: "POST"
    });
    expect(cancelRes.status).toBe(200);
    const cancelData = await cancelRes.json();
    expect(cancelData.cancelled).toBe(true);
  });

  it("returns 404 for unknown endpoints", async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/v1/unknown`);
    expect(res.status).toBe(404);
  });
});
