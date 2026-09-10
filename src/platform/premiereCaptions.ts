import { evalExtendScript, isCep } from "./premiereBridge";
import type { CaptionImportResult, HostRpcResponse, TimelineCaptionDocument } from "./premiereHostTypes";
import { toTimelineCues } from "../core/subtitles/timelineContext";
import { validateAndRepairCaptionDocument } from "../core/subtitles/captionImportValidator";
import { temporaryMedia } from "../services/temporaryMedia";
import { serializeSrt } from "../core/subtitles/srtParser";

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

export class PremiereCaptionsClient {
  /**
   * Validates cues, prepares a timeline-positioned SRT file, saves to a durable
   * directory, and invokes Premiere Pro host to create a native caption track.
   */
  public async importCaptionDocument(
    captionDoc: TimelineCaptionDocument,
    sequenceName = "Active Sequence"
  ): Promise<CaptionImportResult> {
    // 1. Validate and repair cues
    const validation = validateAndRepairCaptionDocument(captionDoc.cues, captionDoc.audioDurationSec);
    if (!validation.valid) {
      const errorDetails = validation.issues
        .filter((i) => i.type === "error")
        .map((i) => i.message)
        .join("; ");
      return {
        status: "failed",
        code: "VALIDATION_FAILED",
        message: `Caption validation failed: ${errorDetails}`
      };
    }

    const cleanCues = validation.repairedCues;
    if (cleanCues.length === 0) {
      return {
        status: "failed",
        code: "NO_CUES",
        message: "No non-empty subtitle cues to import."
      };
    }

    // 2. Build timeline-positioned cues (timelineTime = audioRelativeTime + timelineStartSec)
    const timelineDocument: TimelineCaptionDocument = {
      ...captionDoc,
      cues: cleanCues
    };
    const timelineCues = toTimelineCues(timelineDocument);

    // 3. Serialize to SRT string
    const srtContent = serializeSrt(timelineCues);

    // 4. Write to durable AutoCap output directory
    const srtFilePath = temporaryMedia.createDurableSrtPath(sequenceName);
    const nodeReq = getNodeReq();

    let fileWritten = false;
    if (nodeReq) {
      try {
        const fs = nodeReq("fs");
        fs.writeFileSync(srtFilePath, srtContent, "utf8");
        fileWritten = true;
      } catch (nodeErr) {
        console.warn("Node writeFileSync failed in importCaptionDocument:", nodeErr);
      }
    }

    if (!isCep()) {
      // Browser test fallback: download file if DOM document is present
      if (typeof window !== "undefined" && typeof window.document !== "undefined" && typeof URL?.createObjectURL === "function") {
        try {
          const blob = new Blob([srtContent], { type: "text/plain;charset=utf-8" });
          const url = URL.createObjectURL(blob);
          const a = window.document.createElement("a");
          a.href = url;
          a.download = `AutoCap_${sequenceName}_captions.srt`;
          a.click();
          URL.revokeObjectURL(url);
        } catch {}
      }

      return {
        status: "bin-only",
        filePath: srtFilePath,
        message: "Downloaded subtitle file (Drag into Premiere Pro)."
      };
    }

    if (!fileWritten) {
      return {
        status: "failed",
        code: "WRITE_FAILED",
        message: `Could not write durable SRT file to: ${srtFilePath}`
      };
    }

    // 5. Invoke ExtendScript Host to import and create caption track
    const hostPayload = {
      sequenceId: captionDoc.sequenceId,
      srtPath: srtFilePath,
      timelineStartSec: captionDoc.timelineStartSec,
      format: "Subtitle"
    };

    const script = `$._AutoCap_Host.importCaptionTrack(${JSON.stringify(JSON.stringify(hostPayload))});`;
    const rawResult = await evalExtendScript(script);

    let parsed: HostRpcResponse<CaptionImportResult>;
    try {
      parsed = JSON.parse(rawResult);
    } catch {
      return {
        status: "failed",
        code: "HOST_PARSE_ERROR",
        filePath: srtFilePath,
        message: `ExtendScript error: ${rawResult || "No response from Premiere."}`
      };
    }

    if (!parsed.success || !parsed.data) {
      return {
        status: "failed",
        code: parsed.error?.code || "IMPORT_FAILED",
        filePath: srtFilePath,
        message: parsed.error?.message || "Failed to import caption track."
      };
    }

    return {
      status: parsed.data.status,
      filePath: srtFilePath,
      projectItemName: parsed.data.projectItemName,
      message: parsed.data.message
    };
  }

  /**
   * Converts sequence captions into native, editable Graphic clips on a video track
   * using Premiere Pro's built-in "Upgrade Caption to Graphic" command.
   */
  public async upgradeCaptionsToGraphics(sequenceId?: string): Promise<{ success: boolean; message: string }> {
    if (!isCep()) {
      return {
        success: true,
        message: "Browser demo: simulated upgrading captions to graphic clips."
      };
    }
    const hostPayload = { sequenceId: sequenceId || "" };
    const script = `$._AutoCap_Host.upgradeCaptionsToGraphics(${JSON.stringify(JSON.stringify(hostPayload))});`;
    const rawResult = await evalExtendScript(script);
    try {
      const parsed: HostRpcResponse<any> = JSON.parse(rawResult);
      if (!parsed.success) {
        return {
          success: false,
          message: parsed.error?.message || "Could not execute Upgrade Caption to Graphic."
        };
      }
      return {
        success: true,
        message: parsed.data?.message || "Converted captions to native editable graphic clips on timeline."
      };
    } catch {
      return {
        success: false,
        message: rawResult || "No response from Premiere."
      };
    }
  }
}

export const premiereCaptionsClient = new PremiereCaptionsClient();

