import { evalExtendScript, isCep } from "./premiereBridge";
import type {
  CaptionGraphicsRequest,
  ChunkedGraphicsOptions,
  GraphicBatchRequest,
  GraphicBatchResult,
  HostRpcResponse,
  MOGRTInsertionRequest,
  MOGRTInsertionResult
} from "./premiereHostTypes";
import { convertCaptionText } from "../core/subtitles/captionConverter";

export function resolveDefaultMogrtPath(): string {
  try {
    const csInterface = (window as any)?.__adobe_cep__ ? new (window as any).CSInterface() : null;
    if (csInterface && typeof csInterface.getSystemPath === "function") {
      const extPath = csInterface.getSystemPath("extension");
      if (extPath) {
        const normalized = extPath.replace(/\\/g, "/").replace(/\/$/, "");
        return `${normalized}/assets/AutoCapCaption.mogrt`;
      }
    }
  } catch {}
  return "";
}

export class PremiereGraphicsClient {
  private async callHost<T = any>(
    method: "insertMOGRTGraphic" | "insertCaptionGraphics" | "insertCaptionGraphicsBatch",
    payload: object
  ): Promise<T> {
    const script = `$._AutoCap_Host.${method}(${JSON.stringify(JSON.stringify(payload))});`;
    const rawResult = await evalExtendScript(script);
    let parsed: HostRpcResponse<T>;
    try {
      parsed = JSON.parse(rawResult);
    } catch {
      throw new Error(`ExtendScript error: ${rawResult || "No response from Premiere."}`);
    }
    if (!parsed.success || !parsed.data) {
      throw new Error(parsed.error?.message || `Host method ${method} failed.`);
    }
    return parsed.data;
  }

  /**
   * Inserts a Motion Graphics Template (.mogrt) onto a sequence video track
   * and configures its text with converted Sinhala encoding.
   */
  public async insertGraphic(
    request: MOGRTInsertionRequest
  ): Promise<MOGRTInsertionResult> {
    if (!request.text || !request.text.trim()) {
      return {
        success: false,
        code: "EMPTY_TEXT",
        message: "Please enter text in Sinhala Typer before inserting graphic."
      };
    }

    if (request.durationSec <= 0) {
      return {
        success: false,
        code: "INVALID_DURATION",
        message: "Graphic duration must be greater than 0 seconds."
      };
    }

    // Convert text according to specified encoding
    const encodedText = convertCaptionText(request.text, request.encoding);

    if (!isCep()) {
      return {
        success: true,
        message: `Browser demo: Simulating MOGRT insertion on Video ${request.targetVideoTrackIndex + 1} with text: "${encodedText}"`,
        appliedText: encodedText,
        trackItemName: "Demo_MOGRT_Graphic"
      };
    }

    const templatePath = request.templatePath?.trim() || resolveDefaultMogrtPath();

    const hostPayload = {
      ...request,
      templatePath,
      text: encodedText
    };

    try {
      return await this.callHost<MOGRTInsertionResult>("insertMOGRTGraphic", hostPayload);
    } catch (err: any) {
      return {
        success: false,
        code: "INSERTION_FAILED",
        message: err.message || "Failed to insert MOGRT graphic into Premiere."
      };
    }
  }

  /**
   * Inserts all caption cues into Premiere Pro in small, cancellable batches (5-10 at a time),
   * ensuring the Premiere Pro UI stays responsive and updates live progress.
   */
  public async insertAllCaptionGraphicsChunked(
    request: CaptionGraphicsRequest,
    options?: ChunkedGraphicsOptions
  ): Promise<MOGRTInsertionResult> {
    if (!request.cues.length) {
      return {
        success: false,
        code: "NO_CUES",
        message: "No captions are available to insert as graphics."
      };
    }
    if (!Number.isInteger(request.targetVideoTrackIndex) || request.targetVideoTrackIndex < 0) {
      return {
        success: false,
        code: "INVALID_TRACK",
        message: "Choose a valid target video track."
      };
    }

    const cues = request.cues
      .filter((cue) => cue.text.trim() && cue.end > cue.start)
      .map((cue) => ({
        ...cue,
        text: request.encoding ? convertCaptionText(cue.text, request.encoding) : cue.text,
        start: Math.max(0, cue.start),
        end: Math.max(cue.start + 0.1, cue.end)
      }));

    if (!cues.length) {
      return {
        success: false,
        code: "NO_VALID_CUES",
        message: "All captions are empty or have invalid timing."
      };
    }

    const templatePath = request.templatePath?.trim() || resolveDefaultMogrtPath();
    const batchSize = Math.max(1, Math.min(25, options?.batchSize || 8));
    const totalBatches = Math.ceil(cues.length / batchSize);
    let totalInserted = 0;
    const appliedSet = new Set<string>();
    const missingSet = new Set<string>();

    if (!isCep()) {
      // Browser demo simulation with realistic progression
      for (let b = 0; b < totalBatches; b++) {
        if (options?.signal?.aborted) {
          return {
            success: false,
            code: "ABORTED",
            message: `Cancelled: Inserted ${totalInserted} of ${cues.length} graphics before cancellation.`,
            insertedCount: totalInserted,
            requestedCount: cues.length
          };
        }
        const slice = cues.slice(b * batchSize, (b + 1) * batchSize);
        totalInserted += slice.length;
        if (options?.onProgress) {
          const percentage = Math.round((totalInserted / cues.length) * 100);
          options.onProgress({
            inserted: totalInserted,
            total: cues.length,
            percentage,
            currentBatch: b + 1,
            totalBatches,
            statusText: `Adding graphic ${totalInserted} of ${cues.length} (${percentage}%)...`
          });
        }
        await new Promise((resolve) => setTimeout(resolve, 30));
      }

      return {
        success: true,
        insertedCount: totalInserted,
        requestedCount: cues.length,
        appliedProperties: ["text", "timing", "fontFamily", "fontSize"],
        missingProperties: [],
        message: `Browser demo: prepared ${totalInserted} styled caption graphics.`
      };
    }

    for (let b = 0; b < totalBatches; b++) {
      if (options?.signal?.aborted) {
        return {
          success: false,
          code: "ABORTED",
          message: `Cancelled: Inserted ${totalInserted} of ${cues.length} graphics before cancellation.`,
          insertedCount: totalInserted,
          requestedCount: cues.length
        };
      }

      const batchStartIndex = b * batchSize;
      const batchCues = cues.slice(batchStartIndex, batchStartIndex + batchSize);
      const effectiveMode = b === 0 ? request.mode || "add" : (request.mode === "replace" ? "add" : request.mode || "add");

      const batchPayload: GraphicBatchRequest = {
        sequenceId: request.sequenceId,
        timelineStartSec: request.timelineStartSec,
        templatePath,
        targetVideoTrackIndex: request.targetVideoTrackIndex,
        batchStartIndex,
        totalCues: cues.length,
        cues: batchCues,
        style: request.style,
        mode: effectiveMode
      };

      try {
        const batchResult = await this.callHost<GraphicBatchResult>("insertCaptionGraphicsBatch", batchPayload);
        if (!batchResult.success) {
          return {
            success: false,
            code: batchResult.code || "BATCH_FAILED",
            insertedCount: totalInserted,
            requestedCount: cues.length,
            message: batchResult.message || `Failed inserting batch ${b + 1}`
          };
        }

        totalInserted += batchResult.batchInserted || batchCues.length;
        batchResult.appliedProperties?.forEach((p) => appliedSet.add(p));
        batchResult.missingProperties?.forEach((p) => missingSet.add(p));

        if (options?.onProgress) {
          const percentage = Math.round((totalInserted / cues.length) * 100);
          options.onProgress({
            inserted: totalInserted,
            total: cues.length,
            percentage,
            currentBatch: b + 1,
            totalBatches,
            statusText: `Adding graphic ${totalInserted} of ${cues.length} (${percentage}%)...`
          });
        }

        // Yield slightly between batches to keep Premiere Pro UI responsive
        await new Promise((resolve) => setTimeout(resolve, 20));
      } catch (err: any) {
        return {
          success: false,
          code: "BATCH_RPC_ERROR",
          insertedCount: totalInserted,
          requestedCount: cues.length,
          message: err.message || `Error communicating with Premiere on batch ${b + 1}`
        };
      }
    }

    const appliedProperties = Array.from(appliedSet);
    const missingProperties = Array.from(missingSet);

    return {
      success: true,
      insertedCount: totalInserted,
      requestedCount: cues.length,
      appliedProperties,
      missingProperties,
      message: `Successfully inserted ${totalInserted} styled caption graphics onto Video ${request.targetVideoTrackIndex + 1}.`
    };
  }

  /** Places every subtitle cue as a separately timed, editable MOGRT graphic. */
  public async insertCaptionGraphics(request: CaptionGraphicsRequest): Promise<MOGRTInsertionResult> {
    return this.insertAllCaptionGraphicsChunked(request);
  }
}

export const premiereGraphicsClient = new PremiereGraphicsClient();
