/**
 * Voice Activity Detection (VAD) and speech boundary detection.
 * Implements Section 3 of the AutoCap Product Architecture.
 */

export interface VadConfiguration {
  threshold: number;      // Probability threshold (default 0.5)
  minSpeechMs: number;    // Minimum duration to consider speech (default 250ms)
  minSilenceMs: number;   // Minimum silence to consider pause (default 500ms)
  speechPaddingMs: number;// Padding around speech segments (default 300ms)
}

export const DEFAULT_VAD_CONFIG: VadConfiguration = {
  threshold: 0.5,
  minSpeechMs: 250,
  minSilenceMs: 500,
  speechPaddingMs: 300
};

export interface SpeechSegment {
  start: number;
  end: number;
}

/**
 * Calculates Root Mean Square (RMS) energy in a short window around a given time.
 */
export function calculateWindowRms(
  buffer: AudioBuffer,
  timeSec: number,
  windowSec = 0.08
): number {
  const sampleRate = buffer.sampleRate;
  const startSample = Math.max(0, Math.floor(timeSec * sampleRate));
  const endSample = Math.min(buffer.length, startSample + Math.floor(windowSec * sampleRate));
  const sampleCount = endSample - startSample;
  if (sampleCount <= 0) return 0;

  let sumSquares = 0;
  let measuredSamples = 0;

  // Measure channel 0 (mono) or downmix
  const data = buffer.getChannelData(0);
  const step = Math.max(1, Math.floor(sampleCount / 100)); // Sample every Nth sample for high performance
  for (let i = startSample; i < endSample; i += step) {
    const val = data[i];
    sumSquares += val * val;
    measuredSamples++;
  }

  return measuredSamples > 0 ? Math.sqrt(sumSquares / measuredSamples) : 0;
}

/**
 * Finds the optimal boundary near the target duration that coincides with
 * detected silence, ensuring words are never truncated or sliced in the middle.
 */
export function findSilenceBoundary(
  buffer: AudioBuffer,
  targetSec: number,
  minSec: number,
  maxSec: number,
  stepSec = 0.2
): number {
  const boundedMin = Math.max(0, minSec);
  const boundedMax = Math.min(buffer.duration, maxSec);
  const clampedTarget = Math.min(boundedMax, Math.max(boundedMin, targetSec));

  let bestTime = clampedTarget;
  let lowestEnergy = Number.POSITIVE_INFINITY;

  // Search in expanding concentric steps around the target time
  const searchRadius = Math.max(clampedTarget - boundedMin, boundedMax - clampedTarget);
  for (let offset = 0; offset <= searchRadius; offset += stepSec) {
    // Check right of target
    const rightTime = clampedTarget + offset;
    if (rightTime <= boundedMax) {
      const rightEnergy = calculateWindowRms(buffer, rightTime);
      if (rightEnergy < lowestEnergy) {
        lowestEnergy = rightEnergy;
        bestTime = rightTime;
        // Found a near-zero silence point
        if (lowestEnergy < 0.005) break;
      }
    }

    // Check left of target
    const leftTime = clampedTarget - offset;
    if (leftTime >= boundedMin) {
      const leftEnergy = calculateWindowRms(buffer, leftTime);
      if (leftEnergy < lowestEnergy) {
        lowestEnergy = leftEnergy;
        bestTime = leftTime;
        if (lowestEnergy < 0.005) break;
      }
    }
  }

  return Math.round(bestTime * 100) / 100;
}

