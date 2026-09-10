import { evalExtendScript, isCep } from "./premiereBridge";
import type { AudioSourceRequest, PreparedTimelineAudio, HostRpcResponse } from "./premiereHostTypes";
import { temporaryMedia } from "../services/temporaryMedia";
import { audioPresetManager } from "../services/audioPresetManager";

function getNodeReq(): any {
  if (typeof window !== "undefined" && typeof (window as any).require === "function") {
    try {
      return (window as any).require;
    } catch {
      return null;
    }
  }
  if (typeof globalThis !== "undefined" && typeof (globalThis as any).require === "function") {
    try {
      return (globalThis as any).require;
    } catch {
      return null;
    }
  }
  return null;
}

export class PremiereAudioClient {
  /**
   * Exports timeline audio according to the AudioSourceRequest contract.
   */
  public async exportTimelineAudio(
    request: AudioSourceRequest,
    jobId: string,
    presetPath?: string,
    signal?: AbortSignal
  ): Promise<PreparedTimelineAudio> {
    if (signal?.aborted) {
      throw new Error("Audio export cancelled before initiation.");
    }

    const resolvedPreset = (
      presetPath || (isCep() ? await audioPresetManager.resolveCompatiblePresetPath() : "")
    ).trim();
    if (resolvedPreset) {
      const validation = audioPresetManager.validatePreset(resolvedPreset);
      if (!validation.valid) {
        throw new Error(`Incompatible audio export preset: ${validation.reason}`);
      }
    }
    if (!resolvedPreset && isCep()) {
      throw new Error(
        "No Premiere audio export preset (.epr) is configured. Please select or choose a preset in Settings > Audio Export."
      );
    }

    const tempOutputPath = temporaryMedia.createTempAudioPath(jobId, ".wav");

    // In browser mock mode
    if (!isCep()) {
      if (signal?.aborted) throw new Error("Audio export cancelled.");
      return {
        jobId,
        sequenceId: request.sequenceId,
        audioPath: tempOutputPath,
        durationSec: request.kind === "range" ? request.endSec - request.startSec : 30,
        timelineStartSec: request.kind === "range" ? request.startSec : 0,
        temporary: true
      };
    }

    // Build payload for host.jsx
    const hostPayload = {
      ...request,
      presetPath: resolvedPreset,
      outputPath: tempOutputPath
    };

    const script = `$._AutoCap_Host.exportTimelineAudio(${JSON.stringify(JSON.stringify(hostPayload))});`;
    const rawResult = await evalExtendScript(script);

    // If cancelled while synchronous export was executing, clean up output immediately
    if (signal?.aborted) {
      temporaryMedia.cleanupTempFile(tempOutputPath);
      throw new Error("Audio export was cancelled by user.");
    }

    let parsed: HostRpcResponse<PreparedTimelineAudio>;
    try {
      parsed = JSON.parse(rawResult);
    } catch (parseErr) {
      temporaryMedia.cleanupTempFile(tempOutputPath);
      throw new Error(`ExtendScript export error: ${rawResult || "No response from Premiere host."}`);
    }

    if (!parsed.success || !parsed.data) {
      temporaryMedia.cleanupTempFile(tempOutputPath);
      const errMsg = parsed.error?.message || "Unknown error during Premiere audio export.";
      throw new Error(`Premiere Audio Export Failed (${parsed.error?.code || "ERROR"}): ${errMsg}`);
    }

    // Verify file exists on disk and is non-empty
    const nodeReq = getNodeReq();
    if (nodeReq) {
      const fs = nodeReq("fs");
      if (!fs.existsSync(tempOutputPath)) {
        throw new Error(`Exported audio file was not found on disk at: ${tempOutputPath}`);
      }
      const stat = fs.statSync(tempOutputPath);
      if (stat.size < 100) {
        temporaryMedia.cleanupTempFile(tempOutputPath);
        throw new Error("Exported audio file is empty or corrupted (0 bytes). Check your Premiere export preset.");
      }
    }

    const duration = parsed.data.durationSec > 0
      ? parsed.data.durationSec
      : (request.kind === "range" ? request.endSec - request.startSec : 0);

    return {
      jobId,
      sequenceId: parsed.data.sequenceId || request.sequenceId,
      audioPath: tempOutputPath,
      durationSec: duration,
      timelineStartSec: parsed.data.timelineStartSec ?? (request.kind === "range" ? request.startSec : 0),
      temporary: true
    };
  }
}

export const premiereAudioClient = new PremiereAudioClient();
