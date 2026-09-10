import { evalExtendScript, isCep } from "./premiereBridge";
import type { HostRpcResponse, MOGRTInsertionRequest, MOGRTInsertionResult } from "./premiereHostTypes";
import { convertCaptionText } from "../core/subtitles/captionConverter";

export class PremiereGraphicsClient {
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

    if (!request.templatePath || !request.templatePath.trim()) {
      return {
        success: false,
        code: "NO_TEMPLATE",
        message: "Please select or configure a Motion Graphics Template (.mogrt) path."
      };
    }

    const hostPayload = {
      ...request,
      text: encodedText
    };

    const script = `$._AutoCap_Host.insertMOGRTGraphic(${JSON.stringify(JSON.stringify(hostPayload))});`;
    const rawResult = await evalExtendScript(script);

    let parsed: HostRpcResponse<MOGRTInsertionResult>;
    try {
      parsed = JSON.parse(rawResult);
    } catch {
      return {
        success: false,
        code: "HOST_PARSE_ERROR",
        message: `ExtendScript error: ${rawResult || "No response from Premiere."}`
      };
    }

    if (!parsed.success || !parsed.data) {
      return {
        success: false,
        code: parsed.error?.code || "INSERTION_FAILED",
        message: parsed.error?.message || "Failed to insert MOGRT graphic into Premiere."
      };
    }

    return parsed.data;
  }
}

export const premiereGraphicsClient = new PremiereGraphicsClient();

