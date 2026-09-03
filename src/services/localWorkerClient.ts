import type { SubtitleCue } from "../core/subtitles/srtParser";
import type { TranscribeProgress, TranscribeResult } from "./sttService";

const DEFAULT_WORKER_URL = "http://127.0.0.1:48128";

export interface LocalWorkerHealth {
  status: string;
  version: string;
  worker: string;
  ffmpegAvailable: boolean;
}

/**
 * Checks if the AutoCap Local Media Worker companion process is running on localhost.
 */
export async function checkLocalWorkerHealth(
  baseUrl = DEFAULT_WORKER_URL,
  timeoutMs = 800
): Promise<LocalWorkerHealth | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${baseUrl}/v1/health`, {
      method: "GET",
      signal: controller.signal
    });
    clearTimeout(timer);
    if (res.ok) {
      return (await res.json()) as LocalWorkerHealth;
    }
  } catch {
    clearTimeout(timer);
  }
  return null;
}

export interface LocalWorkerJobOptions {
  mediaPath: string;
  timelineStart?: number;
  timelineEnd?: number;
  language?: string;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  signal?: AbortSignal;
  onProgress?: (progress: TranscribeProgress) => void;
  onCue?: (cue: SubtitleCue) => void;
}

/**
 * Executes high-performance audio extraction, speech chunking, and Gemini transcription
 * through the AutoCap Local Media Worker companion process via SSE.
 */
export async function transcribeWithLocalWorker(
  options: LocalWorkerJobOptions
): Promise<TranscribeResult> {
  const baseUrl = options.baseUrl || DEFAULT_WORKER_URL;

  // 1. Submit Job
  const createRes = await fetch(`${baseUrl}/v1/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mediaPath: options.mediaPath,
      timelineStart: options.timelineStart ?? 0,
      timelineEnd: options.timelineEnd ?? 0,
      language: options.language || "si",
      model: options.model || "gemini-2.5-flash",
      apiKey: options.apiKey
    }),
    signal: options.signal
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Failed to initiate job on Local Worker (${createRes.status}): ${errText}`);
  }

  const { jobId } = (await createRes.json()) as { jobId: string };

  // Setup cancellation listener
  const abortListener = () => {
    fetch(`${baseUrl}/v1/jobs/${jobId}/cancel`, { method: "POST" }).catch(() => {});
  };
  options.signal?.addEventListener("abort", abortListener, { once: true });

  // 2. Stream SSE events
  return new Promise<TranscribeResult>((resolve, reject) => {
    let completedCues: SubtitleCue[] = [];
    let isFinished = false;

    // Use EventSource if available, else fetch stream
    if (typeof EventSource !== "undefined") {
      const sse = new EventSource(`${baseUrl}/v1/jobs/${jobId}/events`);

      const cleanup = () => {
        sse.close();
        options.signal?.removeEventListener("abort", abortListener);
      };

      sse.addEventListener("job.progress", (e) => {
        try {
          const data = JSON.parse(e.data);
          options.onProgress?.({
            status: "transcribing",
            message: data.message || "Processing audio...",
            percent: data.percent
          });
        } catch {}
      });

      sse.addEventListener("chunk.completed", (e) => {
        try {
          const data = JSON.parse(e.data);
          if (Array.isArray(data.cues)) {
            for (const cue of data.cues) {
              options.onCue?.(cue);
            }
          }
        } catch {}
      });

      sse.addEventListener("job.completed", (e) => {
        if (isFinished) return;
        isFinished = true;
        cleanup();
        try {
          const data = JSON.parse(e.data);
          completedCues = (data.cues || []).map((c: any) => ({
            id: c.id,
            start: c.start,
            end: c.end,
            text: c.text
          }));

          resolve({
            cues: completedCues,
            detectedLanguage: "si",
            providerUsed: "AutoCap Companion Worker (FFmpeg + Gemini)",
            isSinhala: true
          });
        } catch (err) {
          reject(err);
        }
      });

      sse.addEventListener("job.failed", (e) => {
        if (isFinished) return;
        isFinished = true;
        cleanup();
        try {
          const data = JSON.parse(e.data);
          reject(new Error(data.message || "Job failed on Local Worker."));
        } catch {
          reject(new Error("Job failed on Local Worker."));
        }
      });

      sse.onerror = () => {
        if (options.signal?.aborted) {
          cleanup();
          reject(new Error("Job cancelled by user."));
        }
      };
    } else {
      // Fallback polling if EventSource is unavailable
      const pollInterval = setInterval(async () => {
        try {
          const jobRes = await fetch(`${baseUrl}/v1/jobs/${jobId}`);
          if (!jobRes.ok) return;
          const jobData = (await jobRes.json()) as any;

          if (jobData.status === "completed") {
            clearInterval(pollInterval);
            options.signal?.removeEventListener("abort", abortListener);
            resolve({
              cues: jobData.cues || [],
              detectedLanguage: "si",
              providerUsed: "AutoCap Companion Worker (FFmpeg + Gemini)",
              isSinhala: true
            });
          } else if (jobData.status === "failed" || jobData.status === "cancelled") {
            clearInterval(pollInterval);
            options.signal?.removeEventListener("abort", abortListener);
            reject(new Error(jobData.error || "Job failed on Local Worker."));
          }
        } catch (pollErr) {
          clearInterval(pollInterval);
          options.signal?.removeEventListener("abort", abortListener);
          reject(pollErr);
        }
      }, 1000);
    }
  });
}

