import { geminiModelRegistry, type ModelPreference } from "./geminiModelRegistry";

// Base64 encoding of a minimal valid 0.5s 16kHz mono 16-bit PCM WAV (silent)
// Header + 16000 samples/sec * 0.5s * 2 bytes = 16044 bytes, or tiny 44-byte minimal header with 100 zero bytes
const TINY_SILENT_WAV_BASE64 =
  "UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";

export interface DiagnosticResult {
  success: boolean;
  testedModel: string;
  latencyMs: number;
  message: string;
  details?: string;
}

export async function runGeminiAudioDiagnostic(
  apiKey: string,
  preference: ModelPreference = "flash",
  signal?: AbortSignal
): Promise<DiagnosticResult> {
  if (!apiKey || !apiKey.trim()) {
    return {
      success: false,
      testedModel: "",
      latencyMs: 0,
      message: "Please enter a valid Google Gemini API Key."
    };
  }

  const startTime = Date.now();
  const candidateModels = await geminiModelRegistry.getCandidateModels(apiKey, preference, signal);

  let lastError = "";

  for (const model of candidateModels) {
    if (signal?.aborted) {
      return {
        success: false,
        testedModel: model,
        latencyMs: Date.now() - startTime,
        message: "Diagnostic test cancelled."
      };
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  inlineData: {
                    mimeType: "audio/wav",
                    data: TINY_SILENT_WAV_BASE64
                  }
                },
                {
                  text: "Describe or transcribe this audio briefly in 1 word."
                }
              ]
            }
          ]
        })
      });

      const latencyMs = Date.now() - startTime;

      if (res.ok) {
        // Audio modality successfully processed!
        geminiModelRegistry.rememberSuccessfulModel(apiKey, model);
        return {
          success: true,
          testedModel: model,
          latencyMs,
          message: `Audio modality verified with ${model} (${latencyMs}ms)!`
        };
      } else {
        const errorData = await res.json().catch(() => ({}));
        const status = res.status;
        const errMsg = errorData?.error?.message || `HTTP ${status}`;

        if (status === 400 && errMsg.includes("API key not valid")) {
          return {
            success: false,
            testedModel: model,
            latencyMs,
            message: "API key is invalid or unauthorized.",
            details: errMsg
          };
        }

        if (status === 429) {
          return {
            success: false,
            testedModel: model,
            latencyMs,
            message: "Rate limit reached for Google Gemini API.",
            details: errMsg
          };
        }

        lastError = `${model}: ${errMsg}`;
        // Continue to next candidate model in list
      }
    } catch (err: any) {
      if (signal?.aborted) {
        return {
          success: false,
          testedModel: model,
          latencyMs: Date.now() - startTime,
          message: "Diagnostic test cancelled."
        };
      }
      lastError = err.message || "Network error";
    }
  }

  return {
    success: false,
    testedModel: candidateModels[0] || "unknown",
    latencyMs: Date.now() - startTime,
    message: `Gemini audio diagnostic failed across candidate models: ${lastError}`
  };
}

