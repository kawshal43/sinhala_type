import type { SubtitleCue } from "../core/subtitles/srtParser";
import { parseCaptionResponse } from "../core/subtitles/srtParser";
import { isSinhalaText } from "../core/subtitles/captionConverter";
import type { AppSettings } from "../storage/appSettings";
import {
  uploadToGeminiFilesApi,
  deleteGeminiFile,
  GEMINI_FILES_API_THRESHOLD_BYTES,
  type GeminiUploadedFile
} from "./geminiFilesApi";

export interface TranscribeProgress {
  status: "uploading" | "transcribing" | "optimizing" | "done" | "error";
  message: string;
  percent?: number;
}

export interface TranscribeResult {
  cues: SubtitleCue[];
  detectedLanguage?: string;
  providerUsed: string;
  isSinhala: boolean;
}

export interface TranscribeOptions {
  file: Blob | File;
  settings: AppSettings;
  mediaPath?: string;
  timelineStart?: number;
  timelineEnd?: number;
  onProgress?: (progress: TranscribeProgress) => void;
  onCue?: (cue: SubtitleCue) => void;
  signal?: AbortSignal;
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  externalSignal?: AbortSignal,
  timeoutMs = 120_000
): Promise<Response> {
  const controller = new AbortController();
  const abort = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) abort();
  else externalSignal?.addEventListener("abort", abort, { once: true });
  const timeout = window.setTimeout(() => controller.abort(new Error("AI request timed out.")), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", abort);
  }
}

function cleanTranscribedText(value: string): string {
  const trimmed = value
    .replace(/^\s*```(?:srt|vtt|text)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  const parsed = parseCaptionResponse(trimmed);
  if (parsed.length > 0) return parsed.map((cue) => cue.text).join(" ").trim();
  return trimmed
    .replace(/^\s*\[(?:id\s*:\s*)?[^\]]+\]\s*/i, "")
    .replace(/^\s*\[?\d{1,2}:\d{2}(?::\d{2})?[,.]\d{1,3}\s*-->\s*\d{1,2}:\d{2}(?::\d{2})?[,.]\d{1,3}\]?\s*/i, "")
    .trim();
}

/**
 * Transcribes audio via Groq Whisper API (whisper-large-v3).
 */
async function transcribeWithGroq(
  file: Blob | File,
  apiKey: string,
  language: string,
  signal?: AbortSignal
): Promise<{ cues: SubtitleCue[]; detectedLanguage?: string }> {
  const formData = new FormData();
  formData.append("file", file, (file as File).name || "audio.wav");
  formData.append("model", "whisper-large-v3");
  formData.append("response_format", "verbose_json");
  if (language && language !== "auto") {
    formData.append("language", language);
  }

  const response = await fetchWithTimeout("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`
    },
    body: formData
  }, signal);

  if (!response.ok) {
    const errorBody = await response.text();
    let errorMsg = `Groq API Error (${response.status})`;
    try {
      const errJson = JSON.parse(errorBody);
      if (errJson.error?.message) errorMsg = errJson.error.message;
    } catch {
      if (errorBody) errorMsg += `: ${errorBody}`;
    }
    throw new Error(errorMsg);
  }

  const data = await response.json();
  const segments = data.segments || [];
  const detectedLanguage = data.language || (language !== "auto" ? language : undefined);

  if (segments.length === 0 && data.text) {
    return {
      cues: [
        {
          id: 1,
          start: 0,
          end: Math.max(2, data.duration || 3),
          text: data.text.trim()
        }
      ],
      detectedLanguage
    };
  }

  return {
    cues: segments.map((seg: any, idx: number) => ({
      id: idx + 1,
      start: Math.max(0, seg.start || 0),
      end: Math.max(seg.start || 0, seg.end || seg.start + 2),
      text: (seg.text || "").trim()
    })),
    detectedLanguage
  };
}

/**
 * Transcribes audio via OpenAI Whisper API (whisper-1).
 */
async function transcribeWithOpenAI(
  file: Blob | File,
  apiKey: string,
  language: string,
  signal?: AbortSignal
): Promise<{ cues: SubtitleCue[]; detectedLanguage?: string }> {
  const formData = new FormData();
  formData.append("file", file, (file as File).name || "audio.wav");
  formData.append("model", "whisper-1");
  formData.append("response_format", "verbose_json");
  if (language && language !== "auto") {
    formData.append("language", language);
  }

  const response = await fetchWithTimeout("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`
    },
    body: formData
  }, signal);

  if (!response.ok) {
    const errorBody = await response.text();
    let errorMsg = `OpenAI API Error (${response.status})`;
    try {
      const errJson = JSON.parse(errorBody);
      if (errJson.error?.message) errorMsg = errJson.error.message;
    } catch {
      if (errorBody) errorMsg += `: ${errorBody}`;
    }
    throw new Error(errorMsg);
  }

  const data = await response.json();
  const segments = data.segments || [];
  const detectedLanguage = data.language || (language !== "auto" ? language : undefined);

  if (segments.length === 0 && data.text) {
    return {
      cues: [
        {
          id: 1,
          start: 0,
          end: Math.max(2, data.duration || 3),
          text: data.text.trim()
        }
      ],
      detectedLanguage
    };
  }

  return {
    cues: segments.map((seg: any, idx: number) => ({
      id: idx + 1,
      start: Math.max(0, seg.start || 0),
      end: Math.max(seg.start || 0, seg.end || seg.start + 2),
      text: (seg.text || "").trim()
    })),
    detectedLanguage
  };
}

/**
 * Helper to convert Blob to base64 string.
 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Transcribes audio via Google Gemini 3.6 Flash API with SRT output.
 * Automatically attempts gemini-3.6-flash, with fallback to gemini-3.7-flash and gemini-3.5-flash-lite.
 */
async function transcribeWithGemini(
  file: Blob | File,
  apiKey: string,
  language: string,
  onCue?: (cue: SubtitleCue) => void,
  signal?: AbortSignal
): Promise<{ cues: SubtitleCue[]; detectedLanguage?: string }> {
  const mimeType = file.type || "audio/mp3";
  let uploadedFile: GeminiUploadedFile | null = null;
  let audioPart: any = null;

  // Use Gemini Files API for large media (>= 4 MB) to avoid large Base64 JSON payload bottlenecks
  if (file.size >= GEMINI_FILES_API_THRESHOLD_BYTES) {
    try {
      uploadedFile = await uploadToGeminiFilesApi(
        file,
        mimeType,
        apiKey,
        "audio_chunk.flac",
        signal
      );
      audioPart = {
        file_data: {
          mime_type: uploadedFile.mimeType,
          file_uri: uploadedFile.uri
        }
      };
    } catch (uploadErr) {
      console.warn("Gemini Files API upload failed, falling back to inline Base64:", uploadErr);
    }
  }

  if (!audioPart) {
    const base64Audio = await blobToBase64(file);
    audioPart = {
      inline_data: {
        mime_type: mimeType,
        data: base64Audio
      }
    };
  }

  const langInstruction =
    language === "si"
      ? "Transcribe strictly in Sinhala language Unicode (සිංහල)."
      : language === "en"
      ? "Transcribe strictly in English."
      : "Transcribe the spoken language accurately (primarily Sinhala or English).";

  const prompt = `You are a professional subtitle transcriptionist.
${langInstruction}
Listen carefully and return accurate caption segments. Timestamps are seconds relative to the beginning of this audio.
Do not include identifiers, markdown, notes, or timestamps inside the text field.`;

  const requestPayload = {
    contents: [
      {
        parts: [
          { text: prompt },
          audioPart
        ]
      }
    ],
    generationConfig: {
      temperature: 0.15,
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          detectedLanguage: {
            type: "STRING",
            enum: ["si", "en", "mixed"]
          },
          segments: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                start: { type: "NUMBER" },
                end: { type: "NUMBER" },
                text: { type: "STRING" },
                confidence: { type: "NUMBER" }
              },
              required: ["start", "end", "text"]
            }
          }
        },
        required: ["segments"]
      }
    }
  };

  const candidateModels = ["gemini-3.6-flash", "gemini-3.7-flash", "gemini-3.5-flash-lite"];
  let lastError = "";

  try {
    for (const model of candidateModels) {
    if (signal?.aborted) throw signal.reason || new Error("Transcription cancelled.");
    // Prefer streaming SSE endpoint for progressive real-time line appearance
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey.trim()}`;
    try {
      const response = await fetchWithTimeout(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload)
      }, signal);

      if (!response.ok) {
        const errorBody = await response.text();
        let errorMsg = `Gemini API Error (${response.status})`;
        try {
          const errJson = JSON.parse(errorBody);
          if (errJson.error?.message) errorMsg = errJson.error.message;
        } catch {
          if (errorBody) errorMsg += `: ${errorBody}`;
        }
        lastError = errorMsg;
        continue;
      }

      let rawText = "";
      const streamedCues: SubtitleCue[] = [];

      if (response.body && typeof (response.body as any).getReader === "function") {
        const reader = (response.body as any).getReader();
        const decoder = new TextDecoder();
        let sseBuffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          sseBuffer += decoder.decode(value, { stream: true });
          const lines = sseBuffer.split("\n");
          sseBuffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith("data:")) {
              const jsonStr = trimmed.slice(5).trim();
              if (!jsonStr || jsonStr === "[DONE]") continue;
              try {
                const chunkData = JSON.parse(jsonStr);
                const textChunk = chunkData.candidates?.[0]?.content?.parts?.[0]?.text || "";
                if (textChunk) {
                  rawText += textChunk;
                  const cleaned = rawText.replace(/^```[a-z]*\n/i, "");
                  const parsed = parseCaptionResponse(cleaned);
                  // The last parsed cue may still be receiving text. Emit only cues
                  // that are followed by more output, then dispatch the last cue once
                  // the stream is complete below.
                  const completedCount = Math.max(0, parsed.length - 1);
                  while (streamedCues.length < completedCount) {
                    const newCue = parsed[streamedCues.length];
                    streamedCues.push(newCue);
                    onCue?.(newCue);
                  }
                }
              } catch {
                // Ignore partial json parse errors in stream
              }
            }
          }
        }
      } else {
        // Fallback for non-streaming reader
        const data = await response.json();
        rawText = Array.isArray(data)
          ? data.map((d: any) => d.candidates?.[0]?.content?.parts?.[0]?.text || "").join("")
          : data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      }

      const cleanedSrt = rawText.replace(/^```[a-z]*\n/i, "").replace(/\n```$/i, "").trim();
      const finalParsed = parseCaptionResponse(cleanedSrt);

      // Dispatch any remaining cues
      while (streamedCues.length < finalParsed.length) {
        const newCue = finalParsed[streamedCues.length];
        streamedCues.push(newCue);
        onCue?.(newCue);
      }

      const cues =
        streamedCues.length > 0
          ? streamedCues
          : finalParsed.length > 0
          ? finalParsed
          : [];

      if (cues.length === 0 && cleanedSrt) {
        throw new Error("The AI returned captions in an unsupported format. Please retry.");
      }

      let detectedLang = language;
      try {
        const parsedJson = JSON.parse(cleanedSrt);
        if (parsedJson?.detectedLanguage === "si" || parsedJson?.detectedLanguage === "en" || parsedJson?.detectedLanguage === "mixed") {
          detectedLang = parsedJson.detectedLanguage === "mixed" ? "si" : parsedJson.detectedLanguage;
        }
      } catch {
        // Fallback to detected language or language parameter
      }

      return { cues, detectedLanguage: detectedLang };
    } catch (err: any) {
      if (signal?.aborted) throw signal.reason || err;
      lastError = err?.message || String(err);
    }
  }

    throw new Error(lastError || "Gemini API failed with all candidate models.");
  } finally {
    if (uploadedFile) {
      deleteGeminiFile(uploadedFile.name, apiKey).catch(() => {});
    }
  }
}

/**
 * Resolves the best available STT provider when 'auto' is selected.
 * Prioritizes Gemini when configured, followed by Groq and OpenAI.
 */
export function resolveAutoProvider(settings: AppSettings): {
  provider: "gemini" | "groq" | "openai";
  label: string;
} {
  if (settings.geminiApiKey && settings.geminiApiKey.trim()) {
    return { provider: "gemini", label: "Google Gemini 3.6 Flash" };
  }
  if (settings.groqApiKey && settings.groqApiKey.trim()) {
    return { provider: "groq", label: "Groq Whisper-large-v3" };
  }
  if (settings.openaiApiKey && settings.openaiApiKey.trim()) {
    return { provider: "openai", label: "OpenAI Whisper-1" };
  }
  throw new Error("No AI API keys configured. Please add your Google Gemini, Groq, or OpenAI key in Settings.");
}

/**
 * Unified transcription entrypoint that supports auto-provider and auto-language detection.
 */
export async function transcribeAudio(options: TranscribeOptions): Promise<TranscribeResult> {
  const { file, settings, onProgress } = options;
  let targetProvider = settings.sttProvider;
  let providerLabel = "AI Engine";

  if (targetProvider === "auto") {
    const resolved = resolveAutoProvider(settings);
    targetProvider = resolved.provider;
    providerLabel = resolved.label;
  }

  onProgress?.({ status: "uploading", message: `Preparing audio for ${providerLabel}...`, percent: 20 });

  let result: { cues: SubtitleCue[]; detectedLanguage?: string };

  if (targetProvider === "gemini") {
    if (!settings.geminiApiKey) throw new Error("Gemini API Key missing. Please add it in Settings.");
    onProgress?.({ status: "transcribing", message: "Streaming captions with Gemini 3.6 Flash...", percent: 40 });
    result = await transcribeWithGemini(file, settings.geminiApiKey, settings.language, options.onCue, options.signal);
    providerLabel = "Google Gemini 3.6 Flash";
  } else if (targetProvider === "groq") {
    if (!settings.groqApiKey) throw new Error("Groq API Key missing. Please add it in Settings.");
    onProgress?.({ status: "transcribing", message: "Transcribing with Groq Whisper...", percent: 55 });
    result = await transcribeWithGroq(file, settings.groqApiKey, settings.language, options.signal);
    providerLabel = "Groq Whisper (Fastest)";
    result.cues.forEach((c) => options.onCue?.(c));
  } else if (targetProvider === "openai") {
    if (!settings.openaiApiKey) throw new Error("OpenAI API Key missing. Please add it in Settings.");
    onProgress?.({ status: "transcribing", message: "Transcribing with OpenAI Whisper...", percent: 55 });
    result = await transcribeWithOpenAI(file, settings.openaiApiKey, settings.language, options.signal);
    providerLabel = "OpenAI Whisper-1";
    result.cues.forEach((c) => options.onCue?.(c));
  } else {
    const resolved = resolveAutoProvider(settings);
    onProgress?.({ status: "transcribing", message: `Streaming with ${resolved.label}...`, percent: 40 });
    result = await transcribeWithGemini(file, settings.geminiApiKey, settings.language, options.onCue, options.signal);
    providerLabel = resolved.label;
  }

  onProgress?.({ status: "optimizing", message: "Formatting subtitle cues...", percent: 90 });

  const allText = result.cues.map((c) => c.text).join(" ");
  const hasSinhalaChars = isSinhalaText(allText);
  const isSinhala = hasSinhalaChars || result.detectedLanguage === "si" || result.detectedLanguage === "sinhala";

  const detectedLanguage = isSinhala ? "si" : result.detectedLanguage || "en";

  onProgress?.({
    status: "done",
    message: `Generated ${result.cues.length} captions (${isSinhala ? "Sinhala Detected" : "English"})!`,
    percent: 100
  });

  return {
    cues: result.cues,
    detectedLanguage,
    providerUsed: providerLabel,
    isSinhala
  };
}

let lastWorkingGeminiModel: string | null = null;

/**
 * Re-transcribes a single audio slice (e.g. for retrying an individual caption).
 * Returns the transcribed text string directly with sub-second response times.
 */
export async function retranscribeCue(options: {
  file: Blob;
  language: string;
  settings: AppSettings;
  contextText?: string;
  signal?: AbortSignal;
}): Promise<string> {
  const { file, language, settings, contextText, signal } = options;
  let targetProvider = settings.sttProvider;

  if (targetProvider === "auto") {
    const resolved = resolveAutoProvider(settings);
    targetProvider = resolved.provider;
  }

  // 1. Ultra-fast Groq Whisper (~200ms latency)
  if (targetProvider === "groq" && settings.groqApiKey) {
    try {
      const formData = new FormData();
      formData.append("file", file, "slice.wav");
      formData.append("model", "whisper-large-v3");
      formData.append("response_format", "json");
      formData.append("temperature", "0.1");
      if (language && language !== "auto") {
        formData.append("language", language);
      }

      const response = await fetchWithTimeout("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${settings.groqApiKey.trim()}`
        },
        body: formData
      }, signal, 45_000);

      if (response.ok) {
        const data = await response.json();
        if (data.text && data.text.trim()) {
          return cleanTranscribedText(data.text);
        }
      }
    } catch (groqErr) {
      if (signal?.aborted) throw signal.reason || groqErr;
      console.warn("Groq direct slice transcription error, falling back:", groqErr);
    }
  }

  // 2. OpenAI Whisper-1
  if (targetProvider === "openai" && settings.openaiApiKey) {
    try {
      const formData = new FormData();
      formData.append("file", file, "slice.wav");
      formData.append("model", "whisper-1");
      formData.append("response_format", "json");
      formData.append("temperature", "0.1");
      if (language && language !== "auto") {
        formData.append("language", language);
      }

      const response = await fetchWithTimeout("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${settings.openaiApiKey.trim()}`
        },
        body: formData
      }, signal, 45_000);

      if (response.ok) {
        const data = await response.json();
        if (data.text && data.text.trim()) {
          return cleanTranscribedText(data.text);
        }
      }
    } catch (openaiErr) {
      if (signal?.aborted) throw signal.reason || openaiErr;
      console.warn("OpenAI direct slice transcription error, falling back:", openaiErr);
    }
  }

  // 3. Google Gemini Flash with model caching
  if (targetProvider === "gemini" && settings.geminiApiKey) {
    const base64Audio = await blobToBase64(file);
    const mimeType = file.type || "audio/wav";
    const langInstruction =
      language === "si"
        ? "Transcribe strictly in Sinhala Unicode (සිංහල). Pay extra attention to clear Sinhala words and spellings."
        : language === "en"
        ? "Transcribe strictly in English."
        : "Transcribe accurately in the spoken language (primarily Sinhala or English).";

    const prompt = `You are an expert audio transcriptionist.
${langInstruction}
Listen carefully to this short speech audio snippet and transcribe the exact spoken words.
${contextText ? `Previous attempt/context was: "${contextText}". Transcribe any missing, clipped, or mumbled words accurately.` : ""}
Output ONLY the clean transcribed sentence text. Do NOT output timestamps, formatting tags, or notes.`;

    const requestPayload = {
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: mimeType,
                data: base64Audio
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.15
      }
    };

    const defaultCandidates = [
      "gemini-3.7-flash",
      "gemini-3.6-flash",
      "gemini-3.5-flash-lite",
      "gemini-2.5-flash"
    ];

    const candidateModels = lastWorkingGeminiModel
      ? [lastWorkingGeminiModel, ...defaultCandidates.filter((m) => m !== lastWorkingGeminiModel)]
      : defaultCandidates;

    for (const model of candidateModels) {
      if (signal?.aborted) throw signal.reason || new Error("Transcription cancelled.");
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${settings.geminiApiKey.trim()}`;
      try {
        const response = await fetchWithTimeout(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestPayload)
        }, signal, 45_000);

        if (!response.ok) continue;

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        const cleaned = cleanTranscribedText(text);
        if (cleaned) {
          lastWorkingGeminiModel = model;
          return cleaned;
        }
      } catch (error) {
        if (signal?.aborted) throw signal.reason || error;
        // try next model
      }
    }
  }

  // Fallback to standard transcribeAudio
  const res = await transcribeAudio({
    file,
    settings,
    signal,
    onProgress: () => {}
  });

  const combined = res.cues.map((c) => c.text).join(" ").trim();
  return combined || (contextText || "");
}

