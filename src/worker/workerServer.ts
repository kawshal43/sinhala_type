import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";

export interface WorkerJob {
  id: string;
  mediaPath: string;
  timelineStart: number;
  timelineEnd: number;
  language: string;
  model: string;
  apiKey?: string;
  status: "queued" | "processing" | "completed" | "cancelled" | "error";
  progress: number;
  message: string;
  cues: Array<{ id: number; start: number; end: number; text: string }>;
  emitter: EventEmitter;
}

export interface WorkerServerOptions {
  port?: number;
  host?: string;
}

export const DEFAULT_WORKER_PORT = 48128;

/**
 * In-memory job table for the Local Media Worker daemon.
 */
const jobs = new Map<string, WorkerJob>();

/**
 * Checks if ffmpeg binary is present on the host.
 */
export function isFfmpegAvailable(): boolean {
  try {
    const defaultLocalPath = path.resolve(
      process.cwd(),
      "node_modules/ffmpeg-static",
      process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg"
    );
    return fs.existsSync(defaultLocalPath);
  } catch {
    return false;
  }
}

/**
 * Creates the HTTP server instance for the AutoCap Local Media Worker.
 */
export function createWorkerServer(): http.Server {
  const server = http.createServer((req, res) => {
    // Enable CORS for CEP and local development
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathname = url.pathname;

    // 1. Health check: GET /v1/health
    if (req.method === "GET" && pathname === "/v1/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "ok",
          version: "1.3.1",
          worker: "autocap-local-worker",
          ffmpegAvailable: isFfmpegAvailable()
        })
      );
      return;
    }

    // 2. Submit Job: POST /v1/jobs
    if (req.method === "POST" && pathname === "/v1/jobs") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });

      req.on("end", () => {
        try {
          const params = JSON.parse(body || "{}");
          const jobId = `job_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

          const job: WorkerJob = {
            id: jobId,
            mediaPath: params.mediaPath || "",
            timelineStart: params.timelineStart || 0,
            timelineEnd: params.timelineEnd || 0,
            language: params.language || "si",
            model: params.model || "gemini-2.5-flash",
            apiKey: params.apiKey,
            status: "queued",
            progress: 0,
            message: "Job queued",
            cues: [],
            emitter: new EventEmitter()
          };

          jobs.set(jobId, job);

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ jobId, status: "queued" }));
        } catch (err: any) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err?.message || "Invalid JSON payload" }));
        }
      });
      return;
    }

    // 3. Cancel Job: POST /v1/jobs/:jobId/cancel
    const cancelMatch = pathname.match(/^\/v1\/jobs\/([^/]+)\/cancel$/);
    if (req.method === "POST" && cancelMatch) {
      const jobId = cancelMatch[1];
      const job = jobs.get(jobId);
      if (job) {
        job.status = "cancelled";
        job.emitter.emit("cancelled");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, cancelled: true }));
      } else {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Job not found" }));
      }
      return;
    }

    // 4. SSE Stream: GET /v1/jobs/:jobId/events
    const eventsMatch = pathname.match(/^\/v1\/jobs\/([^/]+)\/events$/);
    if (req.method === "GET" && eventsMatch) {
      const jobId = eventsMatch[1];
      const job = jobs.get(jobId);

      if (!job) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Job not found" }));
        return;
      }

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive"
      });

      const sendEvent = (event: string, data: any) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      // Send initial state
      sendEvent("progress", { percent: job.progress, message: job.message });

      const onProgress = (p: { percent: number; message: string }) => {
        sendEvent("progress", p);
      };

      const onCue = (cue: any) => {
        sendEvent("cue", cue);
      };

      const onCompleted = (result: any) => {
        sendEvent("completed", result);
        res.end();
      };

      const onError = (err: any) => {
        sendEvent("error", { message: err?.message || String(err) });
        res.end();
      };

      job.emitter.on("progress", onProgress);
      job.emitter.on("cue", onCue);
      job.emitter.on("completed", onCompleted);
      job.emitter.on("error", onError);

      req.on("close", () => {
        job.emitter.off("progress", onProgress);
        job.emitter.off("cue", onCue);
        job.emitter.off("completed", onCompleted);
        job.emitter.off("error", onError);
      });
      return;
    }

    // 5. Job status fallback: GET /v1/jobs/:jobId
    const statusMatch = pathname.match(/^\/v1\/jobs\/([^/]+)$/);
    if (req.method === "GET" && statusMatch) {
      const jobId = statusMatch[1];
      const job = jobs.get(jobId);
      if (job) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            status: job.status,
            progress: job.progress,
            message: job.message,
            cues: job.cues
          })
        );
      } else {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Job not found" }));
      }
      return;
    }

    // Default 404
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Route not found" }));
  });

  return server;
}

/**
 * Starts the worker server on the given port.
 */
export function startWorkerServer(port = DEFAULT_WORKER_PORT): Promise<{ server: http.Server; port: number }> {
  const server = createWorkerServer();
  return new Promise((resolve, reject) => {
    server.listen(port, "127.0.0.1", () => {
      resolve({ server, port });
    });
    server.on("error", reject);
  });
}

