import type {
  AudioSourceRequest,
  PreparedTimelineAudio,
  TimelineCaptionDocument
} from "../platform/premiereHostTypes";
import type { AppSettings } from "../storage/appSettings";
import type { SubtitleCue } from "../core/subtitles/srtParser";
import { optimizeAllCues } from "../core/subtitles/captionOptimizer";
import { isSinhalaText } from "../core/subtitles/captionConverter";
import { createTimelineCaptionDocument } from "../core/subtitles/timelineContext";
import { temporaryMedia } from "./temporaryMedia";
import { transcribeAudioChunked } from "./chunkedTranscription";
import { checkLocalWorkerHealth, transcribeWithLocalWorker, type LocalWorkerHealth } from "./localWorkerClient";

export type JobStage =
  | "idle"
  | "inspecting"
  | "exporting"
  | "preparing"
  | "transcribing"
  | "validating"
  | "ready"
  | "cancelling"
  | "cancelled"
  | "failed";

export interface JobProgress {
  jobId: string;
  stage: JobStage;
  percent: number;
  message: string;
}

export interface JobCallbacks {
  onProgress?: (progress: JobProgress) => void;
  onCue?: (cue: SubtitleCue, totalCuesCount: number) => void;
}

export interface ExportAudioFunction {
  (
    request: AudioSourceRequest,
    jobId: string,
    signal: AbortSignal
  ): Promise<PreparedTimelineAudio>;
}

export class TranscriptionJobController {
  private currentJobId: string | null = null;
  private currentStage: JobStage = "idle";
  private currentAbortController: AbortController | null = null;
  private activeDocument: TimelineCaptionDocument | null = null;

  public getStage(): JobStage {
    return this.currentStage;
  }

  public getActiveJobId(): string | null {
    return this.currentJobId;
  }

  public getActiveDocument(): TimelineCaptionDocument | null {
    return this.activeDocument;
  }

  public isBusy(): boolean {
    return (
      this.currentStage !== "idle" &&
      this.currentStage !== "ready" &&
      this.currentStage !== "cancelled" &&
      this.currentStage !== "failed"
    );
  }

  /**
   * Executes a complete transcription job from timeline audio extraction
   * through speech recognition and caption document assembly.
   */
  public async executeJob(
    request: AudioSourceRequest,
    settings: AppSettings,
    exportAudioFn: ExportAudioFunction,
    callbacks: JobCallbacks = {}
  ): Promise<TimelineCaptionDocument> {
    if (this.isBusy()) {
      throw new Error("A transcription job is already active. Please wait or cancel the current job.");
    }

    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    this.currentJobId = jobId;
    this.currentStage = "inspecting";
    const abortController = new AbortController();
    this.currentAbortController = abortController;

    const emitProgress = (stage: JobStage, percent: number, message: string) => {
      if (this.currentJobId !== jobId) return; // Stale callback check
      this.currentStage = stage;
      callbacks.onProgress?.({ jobId, stage, percent, message });
    };

    emitProgress("inspecting", 5, "Inspecting Premiere sequence & parameters...");

    let preparedAudio: PreparedTimelineAudio | null = null;

    try {
      if (abortController.signal.aborted) throw new Error("Job cancelled.");

      // 1. Export Timeline Audio
      emitProgress("exporting", 15, "Exporting timeline audio from Premiere Pro...");
      preparedAudio = await exportAudioFn(request, jobId, abortController.signal);

      if (abortController.signal.aborted) throw new Error("Job cancelled.");

      // 2. Prepare Audio
      emitProgress("preparing", 30, "Preparing audio for AI transcription...");

      // Worker Policy: Only route to local worker if it explicitly reports active capability
      let useLocalWorker = false;
      try {
        const workerHealth = await checkLocalWorkerHealth();
        if (workerHealth && this.canWorkerProcessRealJobs(workerHealth)) {
          useLocalWorker = true;
        }
      } catch {
        useLocalWorker = false;
      }

      // 3. Transcribe Audio
      emitProgress("transcribing", 35, "Transcribing speech with AI engine...");
      const completedCues: SubtitleCue[] = [];

      let transcribeResult;
      if (useLocalWorker && preparedAudio.audioPath) {
        transcribeResult = await transcribeWithLocalWorker({
          mediaPath: preparedAudio.audioPath,
          timelineStart: 0, // Keep cues relative to exported audio
          timelineEnd: preparedAudio.durationSec,
          language: settings.language || "auto",
          apiKey: settings.geminiApiKey,
          signal: abortController.signal,
          onProgress: (p) => {
            const pct = Math.min(90, Math.max(35, Math.round(p.percent ?? 50)));
            emitProgress("transcribing", pct, p.message || "Streaming captions...");
          },
          onCue: (cue) => {
            if (this.currentJobId !== jobId) return;
            completedCues.push(cue);
            callbacks.onCue?.(cue, completedCues.length);
          }
        });
      } else {
        // Direct / in-memory chunking fallback
        const nodeReq = (typeof window !== "undefined" ? (window as any).require : null) ||
          (typeof globalThis !== "undefined" ? (globalThis as any).require : null);
        let audioBlob: Blob;

        if (nodeReq && preparedAudio.audioPath) {
          const fs = nodeReq("fs");
          const buffer = fs.readFileSync(preparedAudio.audioPath);
          audioBlob = new Blob([buffer], { type: "audio/wav" });
        } else {
          // If already a Blob or in browser context
          audioBlob = (preparedAudio as any).blob || new Blob([], { type: "audio/wav" });
        }

        transcribeResult = await transcribeAudioChunked({
          file: audioBlob,
          settings,
          signal: abortController.signal,
          onProgress: (p) => {
            const pct = Math.min(90, Math.max(35, Math.round(p.percent ?? 50)));
            emitProgress("transcribing", pct, p.message || "Generating captions...");
          },
          onCue: (cue) => {
            if (this.currentJobId !== jobId) return;
            completedCues.push(cue);
            callbacks.onCue?.(cue, completedCues.length);
          }
        });
      }

      if (abortController.signal.aborted) throw new Error("Job cancelled.");

      // 4. Validate & Optimize
      emitProgress("validating", 92, "Validating & optimizing caption timing...");
      const rawCues = transcribeResult.cues.length > 0 ? transcribeResult.cues : completedCues;
      const optimizedCues = optimizeAllCues(rawCues, settings.maxCpl || 38);

      // 5. Construct Final Timeline Caption Document (Relative to exported audio!)
      const document = createTimelineCaptionDocument(
        preparedAudio.sequenceId,
        preparedAudio.timelineStartSec,
        preparedAudio.durationSec,
        optimizedCues
      );

      this.activeDocument = document;
      temporaryMedia.releasePreviousDocuments(jobId);

      emitProgress("ready", 100, `Generated ${document.cues.length} captions successfully.`);
      return document;
    } catch (err: any) {
      if (abortController.signal.aborted || err.message?.includes("cancelled")) {
        emitProgress("cancelled", 0, "Transcription cancelled.");
      } else {
        emitProgress("failed", 0, err.message || "Transcription failed.");
      }

      // Cleanup on failure or cancellation
      temporaryMedia.cleanupJobAudio(jobId);
      throw err;
    } finally {
      if (this.currentJobId === jobId) {
        this.currentAbortController = null;
      }
    }
  }

  /**
   * Cancels the active transcription job, signals the AbortController,
   * and cleans up any partial output.
   */
  public cancelActiveJob(): void {
    if (this.isBusy() && this.currentAbortController) {
      this.currentStage = "cancelling";
      this.currentAbortController.abort(new Error("Job cancelled by user."));
      if (this.currentJobId) {
        temporaryMedia.cleanupJobAudio(this.currentJobId);
      }
    }
  }

  /**
   * Bypasses the local worker unless it reports active real-job capabilities.
   * A responding HTTP server alone must not make it eligible for transcription.
   */
  public canWorkerProcessRealJobs(health: LocalWorkerHealth | null): boolean {
    if (!health) return false;
    if (health.status !== "ok") return false;
    if (!health.ffmpegAvailable) return false;
    // Must be version 1.3+ with verified worker identity
    return health.worker === "autocap-local-worker";
  }
}

export const transcriptionJobController = new TranscriptionJobController();
