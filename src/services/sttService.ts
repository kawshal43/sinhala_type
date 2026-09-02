import type { SubtitleCue } from "../core/subtitles/srtParser";
import { parseSrt } from "../core/subtitles/srtParser";
import { isSinhalaText } from "../core/subtitles/captionConverter";
import type { AppSettings } from "../storage/appSettings";

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
  onProgress?: (progress: TranscribeProgress) => void;
  onCue?: (cue: SubtitleCue) => void;
}

/**
 * Transcribes audio via Groq Whisper API (whisper-large-v3).
 */
async function transcribeWithGroq(
  file: Blob | File,
  apiKey: string,
  language: string
): Promise<{ cues: SubtitleCue[]; detectedLanguage?: string }> {
  const formData = new FormData();
  formData.append("file", file, (file as File).name || "audio.wav");
  formData.append("model", "whisper-large-v3");
  formData.append("response_format", "verbose_json");
  if (language && language !== "auto") {
    formData.append("language", language);
  }

  const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`
    },
    body: formData
  });

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
  language: string
): Promise<{ cues: SubtitleCue[]; detectedLanguage?: string }> {
  const formData = new FormData();
  formData.append("file", file, (file as File).name || "audio.wav");
  formData.append("model", "whisper-1");
  formData.append("response_format", "verbose_json");
  if (language && language !== "auto") {
    formData.append("language", language);
  }

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`
    },
    body: formData
  });

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
  onCue?: (cue: SubtitleCue) => void
): Promise<{ cues: SubtitleCue[]; detectedLanguage?: string }> {
  const base64Audio = await blobToBase64(file);
  const mimeType = file.type || "audio/mp3";

  const langInstruction =
    language === "si"
      ? "Transcribe strictly in Sinhala language Unicode (සිංහල)."
      : language === "en"
      ? "Transcribe strictly in English."
      : "Transcribe the spoken language accurately (primarily Sinhala or English).";

  const prompt = `You are a professional subtitle transcriptionist.
${langInstruction}
Listen carefully to the audio and produce high-accuracy subtitles in standard SubRip (.srt) format.
Ensure timestamps start at 00:00:00,000 and match the spoken speech accurately.
Output ONLY the raw SRT format text without markdown codeblocks or conversational text.`;

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
      temperature: 0.2
    }
  };

  const candidateModels = ["gemini-3.6-flash", "gemini-3.7-flash", "gemini-3.5-flash-lite"];
  let lastError = "";

  for (const model of candidateModels) {
    // Prefer streaming SSE endpoint for progressive real-time line appearance
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey.trim()}`;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload)
      });

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
                  const parsed = parseSrt(cleaned);
                  while (streamedCues.length < parsed.length) {
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
      const finalParsed = parseSrt(cleanedSrt);

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
          : cleanedSrt.trim()
          ? [{ id: 1, start: 0, end: 5, text: cleanedSrt.trim() }]
          : [];

      return { cues, detectedLanguage: language };
    } catch (err: any) {
      lastError = err?.message || String(err);
    }
  }

  throw new Error(lastError || "Gemini API failed with all candidate models.");
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
    result = await transcribeWithGemini(file, settings.geminiApiKey, settings.language, options.onCue);
    providerLabel = "Google Gemini 3.6 Flash";
  } else if (targetProvider === "groq") {
    if (!settings.groqApiKey) throw new Error("Groq API Key missing. Please add it in Settings.");
    onProgress?.({ status: "transcribing", message: "Transcribing with Groq Whisper...", percent: 55 });
    result = await transcribeWithGroq(file, settings.groqApiKey, settings.language);
    providerLabel = "Groq Whisper (Fastest)";
    result.cues.forEach((c) => options.onCue?.(c));
  } else if (targetProvider === "openai") {
    if (!settings.openaiApiKey) throw new Error("OpenAI API Key missing. Please add it in Settings.");
    onProgress?.({ status: "transcribing", message: "Transcribing with OpenAI Whisper...", percent: 55 });
    result = await transcribeWithOpenAI(file, settings.openaiApiKey, settings.language);
    providerLabel = "OpenAI Whisper-1";
    result.cues.forEach((c) => options.onCue?.(c));
  } else {
    const resolved = resolveAutoProvider(settings);
    onProgress?.({ status: "transcribing", message: `Streaming with ${resolved.label}...`, percent: 40 });
    result = await transcribeWithGemini(file, settings.geminiApiKey, settings.language, options.onCue);
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
