import { reindexCues } from "../core/subtitles/captionOptimizer";
import type { SubtitleCue } from "../core/subtitles/srtParser";
import { getOrDecodeAudioBuffer, sliceAudioBlob } from "../platform/premiereBridge";
import { createTranscriptCacheKey, getCachedTranscript, putCachedTranscript } from "../storage/transcriptCache";
import { findSilenceBoundary } from "../core/vad/speechDetector";
import { mergeChunkIntoTimeline } from "../core/subtitles/timelineMerger";
import { clearIncompleteJob, getIncompleteJob, saveIncompleteJob } from "./jobRecovery";
import { transcribeAudio, type TranscribeOptions, type TranscribeResult } from "./sttService";
import { checkLocalWorkerHealth, transcribeWithLocalWorker } from "./localWorkerClient";

const CHUNK_THRESHOLD_SEC = 120;
const TARGET_CHUNK_SEC = 90;
const OVERLAP_SEC = 1;
const MAX_CONCURRENCY = 2;

interface ChunkRange {
  sequence: number;
  start: number;
  end: number;
}

export function createSpeechAwareChunks(buffer: AudioBuffer): ChunkRange[] {
  if (buffer.duration <= CHUNK_THRESHOLD_SEC) {
    return [{ sequence: 0, start: 0, end: buffer.duration }];
  }

  const chunks: ChunkRange[] = [];
  let start = 0;
  while (start < buffer.duration) {
    const remaining = buffer.duration - start;
    let end = remaining <= TARGET_CHUNK_SEC + 15
      ? buffer.duration
      : findSilenceBoundary(buffer, start + TARGET_CHUNK_SEC, start + 60, start + 110);
    end = Math.min(buffer.duration, Math.max(start + 10, end));
    chunks.push({ sequence: chunks.length, start, end });
    if (end >= buffer.duration) break;
    start = Math.max(start + 1, end - OVERLAP_SEC);
  }
  return chunks;
}

/** Transcribes long media concurrently while publishing captions in timeline order. */
export async function transcribeAudioChunked(options: TranscribeOptions): Promise<TranscribeResult> {
  const resolvedPath = options.mediaPath || (options.file as any).mediaPath;
  if (resolvedPath) {
    try {
      const workerHealth = await checkLocalWorkerHealth();
      if (workerHealth) {
        options.onProgress?.({
          status: "uploading",
          message: "Connected to AutoCap Local Companion Worker...",
          percent: 15
        });
        return await transcribeWithLocalWorker({
          mediaPath: resolvedPath,
          timelineStart: options.timelineStart ?? (options.file as any).timelineStart,
          timelineEnd: options.timelineEnd ?? (options.file as any).timelineEnd,
          language: options.settings.language,
          model: (options.settings as any).geminiModel || "gemini-2.5-flash",
          apiKey: options.settings.geminiApiKey,
          signal: options.signal,
          onProgress: options.onProgress,
          onCue: options.onCue
        });
      }
    } catch (workerErr) {
      console.warn("Local Worker transcription encountered an error, falling back to panel execution:", workerErr);
    }
  }

  options.onProgress?.({ status: "uploading", message: "Checking transcript cache...", percent: 12 });
  const cacheKey = await createTranscriptCacheKey(options.file, options.settings);
  const cached = await getCachedTranscript(cacheKey);
  if (cached) {
    cached.cues.forEach((cue) => options.onCue?.(cue));
    options.onProgress?.({ status: "done", message: "Loaded saved transcript.", percent: 100 });
    return { ...cached, providerUsed: `${cached.providerUsed} · cached` };
  }

  const buffer = await getOrDecodeAudioBuffer(options.file);
  const chunks = createSpeechAwareChunks(buffer);
  if (chunks.length === 1) {
    const result = await transcribeAudio(options);
    await putCachedTranscript(cacheKey, result);
    return result;
  }

  const incompleteJob = getIncompleteJob(cacheKey);
  const completed = new Map<number, TranscribeResult>();
  if (incompleteJob && incompleteJob.completedChunks) {
    for (const [seqStr, res] of Object.entries(incompleteJob.completedChunks)) {
      completed.set(Number(seqStr), res);
    }
  }

  let nextWorkIndex = 0;
  let nextPublishIndex = 0;
  let publishedCues: SubtitleCue[] = [];
  let detectedLanguage: string | undefined;
  let isSinhala = false;
  let providerUsed = "Google Gemini";

  const publishReadyChunks = (): void => {
    while (completed.has(nextPublishIndex)) {
      const chunk = chunks[nextPublishIndex];
      const result = completed.get(nextPublishIndex)!;
      const before = publishedCues.length;
      publishedCues = mergeChunkIntoTimeline(publishedCues, result.cues, chunk.start, buffer.duration);
      publishedCues.slice(before).forEach((cue) => options.onCue?.(cue));
      detectedLanguage ||= result.detectedLanguage;
      isSinhala ||= result.isSinhala;
      providerUsed = result.providerUsed;
      nextPublishIndex++;
      options.onProgress?.({
        status: "transcribing",
        message: `Processed ${nextPublishIndex}/${chunks.length} audio sections...`,
        percent: Math.round(20 + (nextPublishIndex / chunks.length) * 68)
      });
    }
  };

  // Publish any chunks already restored from recovery
  if (completed.size > 0) {
    publishReadyChunks();
    options.onProgress?.({
      status: "transcribing",
      message: `Restored ${completed.size}/${chunks.length} sections from session recovery...`,
      percent: 22
    });
  }

  const worker = async (): Promise<void> => {
    while (true) {
      if (options.signal?.aborted) {
        saveIncompleteJob({
          cacheKey,
          totalChunks: chunks.length,
          completedChunks: Object.fromEntries(completed.entries()),
          cues: publishedCues,
          updatedAt: Date.now()
        });
        throw options.signal.reason || new Error("Transcription cancelled.");
      }
      const workIndex = nextWorkIndex++;
      if (workIndex >= chunks.length) return;
      if (completed.has(workIndex)) {
        publishReadyChunks();
        continue;
      }
      const chunk = chunks[workIndex];
      const blob = await sliceAudioBlob(options.file, chunk.start, chunk.end, 0);
      const result = await transcribeAudio({
        file: blob,
        settings: options.settings,
        signal: options.signal
      });
      completed.set(workIndex, result);
      saveIncompleteJob({
        cacheKey,
        totalChunks: chunks.length,
        completedChunks: Object.fromEntries(completed.entries()),
        cues: publishedCues,
        updatedAt: Date.now()
      });
      publishReadyChunks();
    }
  };

  options.onProgress?.({
    status: "transcribing",
    message: `Processing ${chunks.length} speech-aware audio sections...`,
    percent: 20
  });
  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENCY, chunks.length) }, () => worker()));

  publishedCues.sort((a, b) => a.start - b.start || a.end - b.end);
  const finalResult: TranscribeResult = {
    cues: reindexCues(publishedCues),
    detectedLanguage,
    providerUsed: `${providerUsed} · ${chunks.length} sections`,
    isSinhala
  };

  clearIncompleteJob(cacheKey);
  await putCachedTranscript(cacheKey, finalResult);
  return finalResult;
}
