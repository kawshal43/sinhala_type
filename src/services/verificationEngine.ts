import type { SubtitleCue } from "../core/subtitles/srtParser";
import type { AppSettings } from "../storage/appSettings";
import {
  findAudioGaps,
  findSuspiciousCues,
  mergeAndSortCues,
  auditSubtitleVerification,
  type VerificationAuditReport
} from "../core/subtitles/captionVerifier";
import { getOrDecodeAudioBuffer, sliceAudioBlob } from "../platform/premiereBridge";
import { retranscribeCue } from "./sttService";
import { formatDisplayDuration } from "../core/subtitles/timeUtils";

export class VerificationController {
  private _isPaused = false;
  private _isCancelled = false;
  private _pausePromiseResolve: (() => void) | null = null;
  private readonly _abortController = new AbortController();

  get signal(): AbortSignal {
    return this._abortController.signal;
  }

  get isPaused(): boolean {
    return this._isPaused;
  }

  get isCancelled(): boolean {
    return this._isCancelled;
  }

  pause(): void {
    this._isPaused = true;
  }

  resume(): void {
    this._isPaused = false;
    if (this._pausePromiseResolve) {
      this._pausePromiseResolve();
      this._pausePromiseResolve = null;
    }
  }

  togglePause(): boolean {
    if (this._isPaused) {
      this.resume();
    } else {
      this.pause();
    }
    return this._isPaused;
  }

  stop(): void {
    this._isCancelled = true;
    this._abortController.abort(new Error("Caption processing was cancelled."));
    this.resume(); // unblock any pause wait so loop can exit immediately
  }

  async checkPauseOrCancel(): Promise<boolean> {
    if (this._isCancelled) return true;

    if (this._isPaused) {
      await new Promise<void>((resolve) => {
        this._pausePromiseResolve = resolve;
      });
    }

    return this._isCancelled;
  }
}

export interface VerificationOptions {
  audioBlob: Blob;
  audioDuration: number;
  cues: SubtitleCue[];
  settings: AppSettings;
  controller: VerificationController;
  onProgress?: (percent: number, message: string) => void;
  onCueUpdated?: (cue: SubtitleCue, index: number) => void;
  onCueAdded?: (cue: SubtitleCue) => void;
}

export interface VerificationResult {
  cues: SubtitleCue[];
  audit: VerificationAuditReport;
  stoppedEarly: boolean;
  filledGapsCount: number;
  recheckedCount: number;
}

/** Avoids sending silent timeline gaps to an AI model. */
async function hasAudibleSignal(audioBlob: Blob, start: number, end: number): Promise<boolean> {
  try {
    const buffer = await getOrDecodeAudioBuffer(audioBlob);
    const from = Math.max(0, Math.floor(start * buffer.sampleRate));
    const to = Math.min(buffer.length, Math.ceil(end * buffer.sampleRate));
    if (to <= from) return false;

    const frameSize = Math.max(1, Math.floor(buffer.sampleRate * 0.02));
    let activeFrames = 0;
    let totalFrames = 0;
    for (let frameStart = from; frameStart < to; frameStart += frameSize) {
      const frameEnd = Math.min(to, frameStart + frameSize);
      let sumSquares = 0;
      let sampleCount = 0;
      for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        const samples = buffer.getChannelData(channel);
        for (let i = frameStart; i < frameEnd; i += 4) {
          sumSquares += samples[i] * samples[i];
          sampleCount++;
        }
      }
      const rms = sampleCount > 0 ? Math.sqrt(sumSquares / sampleCount) : 0;
      if (rms >= 0.006) activeFrames++;
      totalFrames++;
    }
    return totalFrames > 0 && activeFrames / totalFrames >= 0.05;
  } catch {
    // If this media cannot be decoded locally, preserve the existing API fallback.
    return true;
  }
}

/**
 * Iteratively verifies all captions:
 * 1. Re-checks suspicious (short, empty, or cutoff) cues and fills missing words.
 * 2. Scans for timeline audio gaps and transcribes them to fill in missing dialogue.
 * 3. Supports live pause, resume, and cancellation at every iteration.
 */
export async function recheckAndFillGaps(
  options: VerificationOptions
): Promise<VerificationResult> {
  const {
    audioBlob,
    audioDuration,
    cues,
    settings,
    controller,
    onProgress,
    onCueUpdated,
    onCueAdded
  } = options;

  let currentCues = [...cues];
  let recheckedCount = 0;
  let filledGapsCount = 0;

  // Phase 1: Re-check suspicious / incomplete cues
  const suspiciousIndices = findSuspiciousCues(currentCues);
  for (let i = 0; i < suspiciousIndices.length; i++) {
    if (await controller.checkPauseOrCancel()) {
      break;
    }

    const cueIdx = suspiciousIndices[i];
    const targetCue = currentCues[cueIdx];
    if (!targetCue) continue;

    const progressPct = Math.round(50 + ((i + 1) / Math.max(1, suspiciousIndices.length)) * 25);
    onProgress?.(
      progressPct,
      `Rechecking line #${cueIdx + 1} (${i + 1}/${suspiciousIndices.length})...`
    );

    try {
      const slice = await sliceAudioBlob(audioBlob, targetCue.start, targetCue.end);
      const newText = await retranscribeCue({
        file: slice,
        language: settings.language,
        settings,
        contextText: targetCue.text,
        signal: controller.signal
      });

      if (newText && newText.trim()) {
        const cleaned = newText.trim();
        // Update if new text adds more content
        if (cleaned.length > targetCue.text.trim().length || targetCue.text.trim().length <= 2) {
          targetCue.text = cleaned;
          recheckedCount++;
          onCueUpdated?.(targetCue, cueIdx);
        }
      }
    } catch {
      // Non-fatal, continue with remaining cues
    }
  }

  // Phase 2: Detect audio gaps and fill missing dialogue
  if (!controller.isCancelled) {
    const gaps = findAudioGaps(currentCues, audioDuration, 2.2);
    const newFilledCues: SubtitleCue[] = [];

    for (let g = 0; g < gaps.length; g++) {
      if (await controller.checkPauseOrCancel()) {
        break;
      }

      const gap = gaps[g];
      const gapProgressPct = Math.round(75 + ((g + 1) / Math.max(1, gaps.length)) * 20);
      onProgress?.(
        gapProgressPct,
        `Filling gap at ${formatDisplayDuration(gap.start)} - ${formatDisplayDuration(gap.end)}...`
      );

      try {
        if (!(await hasAudibleSignal(audioBlob, gap.start, gap.end))) continue;
        const gapSlice = await sliceAudioBlob(audioBlob, gap.start, gap.end);
        const gapText = await retranscribeCue({
          file: gapSlice,
          language: settings.language,
          settings,
          signal: controller.signal
        });

        if (gapText && gapText.trim() && gapText.trim().length > 1) {
          const filledCue: SubtitleCue = {
            id: currentCues.length + newFilledCues.length + 1,
            start: gap.start,
            end: gap.end,
            text: gapText.trim()
          };
          newFilledCues.push(filledCue);
          filledGapsCount++;
          onCueAdded?.(filledCue);
        }
      } catch {
        // Non-fatal, continue with remaining gaps
      }
    }

    if (newFilledCues.length > 0) {
      currentCues = mergeAndSortCues(currentCues, newFilledCues);
    }
  }

  // Phase 3: Verification Audit
  const audit = auditSubtitleVerification(currentCues, audioDuration);

  onProgress?.(
    100,
    controller.isCancelled
      ? `Stopped: Kept ${currentCues.length} captions.`
      : audit.summary
  );

  return {
    cues: currentCues,
    audit,
    stoppedEarly: controller.isCancelled,
    filledGapsCount,
    recheckedCount
  };
}
