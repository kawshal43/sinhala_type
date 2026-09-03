import { copyToHostClipboard } from "./clipboard";

export function isCep(): boolean {
  return typeof window !== "undefined" && typeof (window as any).__adobe_cep__ !== "undefined";
}

/**
 * Evaluates an ExtendScript command inside Adobe Premiere Pro.
 */
export function evalExtendScript(script: string): Promise<string> {
  return new Promise((resolve) => {
    if (isCep()) {
      try {
        (window as any).__adobe_cep__.evalScript(script, (result: string) => {
          resolve(result || "");
        });
        return;
      } catch (e) {
        console.warn("Error calling evalScript:", e);
      }
    }
    resolve("");
  });
}

export interface SequenceClipInfo {
  name: string;
  mediaPath: string;
  inPoint: number;
  outPoint: number;
  duration: number;
  startTime?: number;
  endTime?: number;
  nestedFrom?: string;
  trackIndex?: number;
}

export interface SequenceAudioTrackInfo {
  index: number;
  name: string;
  isMuted: boolean;
  clipCount: number;
  clips: SequenceClipInfo[];
}

export interface ActiveSequenceInfo {
  sequenceName: string;
  tracks: SequenceAudioTrackInfo[];
  selectedClips?: SequenceClipInfo[];
  error?: string;
}

/**
 * Retrieves the active Premiere Pro sequence's audio tracks, clip media paths,
 * resolved nested sequences, and active timeline clip selection.
 */
export async function getSequenceAudioTracks(): Promise<ActiveSequenceInfo> {
  if (!isCep()) {
    // Return sample demo data when running in browser mode
    return {
      sequenceName: "Demo Sequence",
      selectedClips: [
        {
          name: "voiceover_part1.wav",
          mediaPath: "C:/Projects/voiceover_part1.wav",
          inPoint: 0,
          outPoint: 15,
          duration: 15,
          startTime: 0,
          endTime: 15,
          trackIndex: 0
        }
      ],
      tracks: [
        {
          index: 0,
          name: "Audio 1 (Voiceover)",
          isMuted: false,
          clipCount: 2,
          clips: [
            {
              name: "voiceover_part1.wav",
              mediaPath: "C:/Projects/voiceover_part1.wav",
              inPoint: 0,
              outPoint: 15,
              duration: 15,
              startTime: 0,
              endTime: 15,
              trackIndex: 0
            },
            {
              name: "voiceover_part2.wav",
              mediaPath: "C:/Projects/voiceover_part2.wav",
              inPoint: 0,
              outPoint: 30,
              duration: 30,
              startTime: 15,
              endTime: 45,
              trackIndex: 0
            }
          ]
        },
        {
          index: 1,
          name: "Audio 2 (Music)",
          isMuted: false,
          clipCount: 1,
          clips: [
            {
              name: "bg_music.mp3",
              mediaPath: "C:/Projects/bg_music.mp3",
              inPoint: 0,
              outPoint: 60,
              duration: 60,
              startTime: 0,
              endTime: 60,
              trackIndex: 1
            }
          ]
        }
      ]
    };
  }

  const script = `
    (function() {
      try {
        if (!app.project) {
          return JSON.stringify({ error: "No open project in Premiere Pro." });
        }
        var seq = app.project.activeSequence;
        if (!seq && app.project.sequences && app.project.sequences.numSequences > 0) {
          seq = app.project.sequences[0];
        }
        if (!seq) {
          return JSON.stringify({ error: "No active sequence opened in Premiere Pro." });
        }

        // Helper to resolve regular clips and drill into nested sequences
        function resolveClipItems(trackItem, depth, tIndex) {
          if (!trackItem || depth > 5) return [];
          var pItem = trackItem.projectItem;
          if (!pItem) return [];

          var isSeq = false;
          try {
            isSeq = pItem.isSequence();
          } catch (e) {}

          if (isSeq) {
            var nestedSeq = null;
            for (var s = 0; s < app.project.sequences.numSequences; s++) {
              var cand = app.project.sequences[s];
              if (cand && cand.projectItem && cand.projectItem.nodeId === pItem.nodeId) {
                nestedSeq = cand;
                break;
              }
            }
            if (!nestedSeq) {
              for (var s = 0; s < app.project.sequences.numSequences; s++) {
                var cand = app.project.sequences[s];
                if (cand && cand.name === pItem.name) {
                  nestedSeq = cand;
                  break;
                }
              }
            }
            if (nestedSeq) {
              var nestedClips = [];
              for (var at = 0; at < nestedSeq.audioTracks.numTracks; at++) {
                var aTrack = nestedSeq.audioTracks[at];
                for (var ac = 0; ac < aTrack.clips.numItems; ac++) {
                  var subClip = aTrack.clips[ac];
                  var subItems = resolveClipItems(subClip, depth + 1, tIndex);
                  for (var k = 0; k < subItems.length; k++) {
                    subItems[k].nestedFrom = pItem.name;
                    nestedClips.push(subItems[k]);
                  }
                }
              }
              return nestedClips;
            }
          }

          var mediaPath = "";
          try {
            if (pItem.getMediaPath) {
              mediaPath = pItem.getMediaPath();
            }
          } catch (e) {}

          if (mediaPath) {
            return [{
              name: trackItem.name || pItem.name || "Audio Clip",
              mediaPath: mediaPath,
              inPoint: trackItem.inPoint ? trackItem.inPoint.seconds : 0,
              outPoint: trackItem.outPoint ? trackItem.outPoint.seconds : 0,
              duration: trackItem.duration ? trackItem.duration.seconds : 0,
              startTime: trackItem.start ? trackItem.start.seconds : 0,
              endTime: trackItem.end ? trackItem.end.seconds : 0,
              trackIndex: tIndex
            }];
          }
          return [];
        }

        var tracks = [];
        var numAudio = seq.audioTracks.numTracks;
        for (var i = 0; i < numAudio; i++) {
          var track = seq.audioTracks[i];
          var clips = [];
          for (var c = 0; c < track.clips.numItems; c++) {
            var clip = track.clips[c];
            var resolved = resolveClipItems(clip, 0, i);
            for (var r = 0; r < resolved.length; r++) {
              clips.push(resolved[r]);
            }
          }
          tracks.push({
            index: i,
            name: track.name || ("Audio " + (i + 1)),
            isMuted: track.isMuted ? track.isMuted() : false,
            clipCount: clips.length,
            clips: clips
          });
        }

        // Retrieve active timeline clip selection
        var selectedClips = [];
        try {
          if (seq.getSelection) {
            var sel = seq.getSelection();
            if (sel && sel.length > 0) {
              for (var s = 0; s < sel.length; s++) {
                var sClip = sel[s];
                var sResolved = resolveClipItems(sClip, 0, -1);
                for (var sr = 0; sr < sResolved.length; sr++) {
                  selectedClips.push(sResolved[sr]);
                }
              }
            }
          }
        } catch (selErr) {}

        return JSON.stringify({
          sequenceName: seq.name,
          tracks: tracks,
          selectedClips: selectedClips
        });
      } catch (err) {
        return JSON.stringify({ error: err.toString() });
      }
    })();
  `;

  const rawJson = await evalExtendScript(script);
  try {
    return JSON.parse(rawJson);
  } catch {
    return {
      sequenceName: "",
      tracks: [],
      error: "Could not inspect Premiere Pro audio tracks."
    };
  }
}

function getMimeTypeFromPath(filepath: string): string {
  const ext = ("." + (filepath.split(".").pop() || "wav")).toLowerCase();
  switch (ext) {
    case ".mp3":
      return "audio/mp3";
    case ".m4a":
    case ".aac":
      return "audio/m4a";
    case ".mp4":
      return "video/mp4";
    case ".mov":
      return "video/quicktime";
    case ".webm":
      return "audio/webm";
    case ".flac":
      return "audio/flac";
    case ".ogg":
      return "audio/ogg";
    case ".aif":
    case ".aiff":
      return "audio/aiff";
    default:
      return "audio/wav";
  }
}

function base64ToBlob(
  base64: string,
  mimeType: string,
  onProgress?: (percent: number) => void
): Blob {
  // Fast path: Node.js Buffer decodes binary base64 directly in native C++ (instantaneous)
  const nodeReq = getNodeRequire();
  if (nodeReq) {
    try {
      const bufferMod = nodeReq("buffer");
      if (bufferMod && bufferMod.Buffer) {
        const buf = bufferMod.Buffer.from(base64, "base64");
        onProgress?.(100);
        return new Blob([buf], { type: mimeType });
      }
    } catch { /* fallback */ }
  }

  // Strip all whitespace, newlines (\r, \n), and invalid characters which cause "Invalid character" DOMException
  const cleaned = base64.replace(/[^A-Za-z0-9+/=]/g, "");
  const remainder = cleaned.length % 4;
  const padded = remainder === 0 ? cleaned : cleaned + "=".repeat(4 - remainder);

  const atobFn =
    typeof window !== "undefined" && typeof window.atob === "function"
      ? (s: string) => window.atob(s)
      : (s: string) => Buffer.from(s, "base64").toString("binary");

  // Decode in 128KB chunks
  const chunkSize = 131072;
  const byteArrays: Uint8Array[] = [];
  const total = padded.length;

  for (let offset = 0; offset < total; offset += chunkSize) {
    const slice = padded.slice(offset, offset + chunkSize);
    const binaryChunk = atobFn(slice);
    const bytes = new Uint8Array(binaryChunk.length);
    for (let i = 0; i < binaryChunk.length; i++) {
      bytes[i] = binaryChunk.charCodeAt(i);
    }
    byteArrays.push(bytes);

    if (onProgress && total > 0) {
      const pct = Math.min(100, Math.round(((offset + slice.length) / total) * 100));
      onProgress(pct);
    }
  }

  onProgress?.(100);
  return new Blob(byteArrays as any[], { type: mimeType });
}

function getNodeRequire(): any {
  if (typeof window !== "undefined") {
    if (typeof (window as any).require === "function") return (window as any).require;
    if (typeof (window as any).cep_node?.require === "function") return (window as any).cep_node.require;
    if (typeof (window as any).process?.mainModule?.require === "function") return (window as any).process.mainModule.require;
  }
  return null;
}

/**
 * Loads a media file from local disk directly via CEP native file system or Node.js.
 */
export async function loadMediaFileFromPath(
  mediaPath: string,
  onProgress?: (percent: number, message: string) => void
): Promise<{ blob: Blob; filename: string }> {
  if (!mediaPath || !mediaPath.trim()) throw new Error("Media path is empty.");

  const cleanPath = mediaPath.trim();
  const filename = cleanPath.split(/[/\\]/).pop() || "track_audio.wav";
  const mimeType = getMimeTypeFromPath(filename);

  onProgress?.(10, `Accessing "${filename}"...`);

  // Strategy 1: Node.js fs (asynchronous, non-blocking binary stream)
  const nodeReq = getNodeRequire();
  if (nodeReq) {
    try {
      const fs = nodeReq("fs");
      if (fs && typeof fs.readFile === "function") {
        onProgress?.(25, `Reading media stream...`);
        const buffer = await new Promise<Buffer>((resolve, reject) => {
          fs.readFile(cleanPath, (err: any, data: Buffer) => {
            if (err) reject(err);
            else resolve(data);
          });
        });
        onProgress?.(80, `Processing audio data...`);
        const blob = new Blob([buffer as any], { type: mimeType });
        onProgress?.(100, `Audio loaded!`);
        return { blob, filename };
      }
    } catch (nodeErr: any) {
      console.warn("Node.js async read error, trying native CEP fs:", nodeErr);
    }
  }

  // Strategy 2: Adobe CEP native file system (always present in Premiere CEP)
  const cepFs = typeof window !== "undefined" ? (window as any).cep?.fs : null;
  if (cepFs && typeof cepFs.readFile === "function") {
    onProgress?.(25, `Reading media via Premiere CEP...`);
    const base64Encoding = (window as any).cep?.encoding?.Base64 || 2;
    let readResult = cepFs.readFile(cleanPath, base64Encoding);

    // If failed, try normalized opposite slashes
    if (readResult.err !== 0) {
      const altPath = cleanPath.includes("/") ? cleanPath.replace(/\//g, "\\") : cleanPath.replace(/\\/g, "/");
      readResult = cepFs.readFile(altPath, base64Encoding);
    }

    if (readResult.err === 0 && readResult.data) {
      onProgress?.(50, `Decoding audio stream...`);
      const blob = base64ToBlob(readResult.data, mimeType, (pct) => {
        const mappedPct = Math.round(50 + pct * 0.5);
        onProgress?.(mappedPct, `Decoding audio stream (${mappedPct}%)...`);
      });
      onProgress?.(100, `Audio loaded!`);
      return { blob, filename };
    }

    if (readResult.err !== 0) {
      const errDesc =
        readResult.err === 1
          ? "File not found on disk"
          : readResult.err === 2
          ? "File access denied"
          : `CEP code ${readResult.err}`;
      throw new Error(`Cannot open media file: "${filename}" (${errDesc}).`);
    }
  }

  // Fallback demo blob in pure browser mode
  if (!isCep()) {
    onProgress?.(100, "Loaded test audio.");
    const emptyWav = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x66, 0x6d, 0x74, 0x20,
      0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x44, 0xac, 0x00, 0x00, 0x88, 0x58, 0x01, 0x00,
      0x02, 0x00, 0x10, 0x00, 0x64, 0x61, 0x74, 0x61, 0x00, 0x00, 0x00, 0x00
    ]);
    return { blob: new Blob([emptyWav], { type: "audio/wav" }), filename };
  }

  throw new Error(`Could not access audio file on disk: "${filename}". Please check if the file exists.`);
}

export interface PreparedTranscriptionMedia {
  blob: Blob;
  filename: string;
  optimized: boolean;
  originalBytes?: number;
  preparedBytes: number;
  preparationMs: number;
}

function resolveFfmpegExecutable(nodeReq: any): string {
  const fs = nodeReq("fs");
  const path = nodeReq("path");
  const candidates: string[] = [];
  try {
    const pagePath = nodeReq("url").fileURLToPath(window.location.href);
    candidates.push(path.join(path.dirname(pagePath), "bin", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg"));
  } catch {
    // Browser URL is not a local file URL.
  }
  try {
    const packageBinary = nodeReq("ffmpeg-static");
    if (packageBinary) candidates.push(packageBinary);
  } catch {
    // Installed extensions do not ship node_modules.
  }
  return candidates.find((candidate) => fs.existsSync(candidate)) || "ffmpeg";
}

/**
 * Extracts compact, speech-ready audio without loading the source video into the
 * panel. CEP installations with FFmpeg available use 16 kHz mono FLAC; other
 * runtimes safely fall back to the original loader.
 */
export async function prepareMediaForTranscription(
  mediaPath: string,
  sourceStartSec = 0,
  sourceDurationSec = 0,
  onProgress?: (percent: number, message: string) => void
): Promise<PreparedTranscriptionMedia> {
  const startedAt = Date.now();
  const nodeReq = getNodeRequire();

  if (nodeReq) {
    let outputPath = "";
    try {
      const fs = nodeReq("fs");
      const os = nodeReq("os");
      const path = nodeReq("path");
      const crypto = nodeReq("crypto");
      const childProcess = nodeReq("child_process");
      outputPath = path.join(os.tmpdir(), `autocap-${crypto.randomBytes(8).toString("hex")}.flac`);

      const args: string[] = ["-hide_banner", "-loglevel", "error", "-y"];
      if (sourceStartSec > 0) args.push("-ss", String(sourceStartSec));
      args.push("-i", mediaPath);
      if (sourceDurationSec > 0) args.push("-t", String(sourceDurationSec));
      args.push("-vn", "-ac", "1", "-ar", "16000", "-c:a", "flac", outputPath);

      onProgress?.(15, "Extracting speech audio...");
      await new Promise<void>((resolve, reject) => {
        const process = childProcess.spawn(resolveFfmpegExecutable(nodeReq), args, {
          windowsHide: true,
          stdio: ["ignore", "ignore", "pipe"]
        });
        let errorText = "";
        process.stderr?.on("data", (chunk: Buffer) => {
          if (errorText.length < 4000) errorText += chunk.toString();
        });
        process.once("error", reject);
        process.once("close", (code: number) => {
          code === 0 ? resolve() : reject(new Error(errorText.trim() || `FFmpeg exited with code ${code}`));
        });
      });

      onProgress?.(75, "Loading optimized audio...");
      const [prepared, sourceStats] = await Promise.all([
        fs.promises.readFile(outputPath),
        fs.promises.stat(mediaPath).catch(() => null)
      ]);
      const blob = new Blob([prepared as any], { type: "audio/flac" });
      return {
        blob,
        filename: `${path.parse(mediaPath).name}.flac`,
        optimized: true,
        originalBytes: sourceStats?.size,
        preparedBytes: blob.size,
        preparationMs: Date.now() - startedAt
      };
    } catch (error) {
      console.warn("Audio-only preprocessing unavailable; using original media:", error);
    } finally {
      if (outputPath) {
        try {
          nodeReq("fs").unlinkSync(outputPath);
        } catch {
          // Temporary output may not have been created.
        }
      }
    }
  }

  const fallback = await loadMediaFileFromPath(mediaPath, onProgress);
  return {
    ...fallback,
    optimized: false,
    originalBytes: fallback.blob.size,
    preparedBytes: fallback.blob.size,
    preparationMs: Date.now() - startedAt
  };
}

/**
 * Exports subtitle content to a file. In Adobe CEP, prompts the user with the native OS
 * Save As dialog and saves the file directly to disk with proper encoding.
 * In browser mode, falls back to standard download.
 */
export async function exportSubtitleFile(
  content: string,
  defaultFilename: string,
  extension: "srt" | "vtt"
): Promise<{ success: boolean; message: string; filePath?: string }> {
  if (isCep()) {
    try {
      const cepFs = (window as any).cep?.fs;
      if (cepFs && typeof cepFs.showSaveDialogEx === "function") {
        const filter = extension === "srt" ? ["*.srt"] : ["*.vtt"];
        const desc = extension === "srt" ? "SubRip Subtitles (*.srt)" : "WebVTT Subtitles (*.vtt)";
        const saveDialogResult = cepFs.showSaveDialogEx(
          `Export .${extension.toUpperCase()} Subtitles`,
          "",
          filter,
          defaultFilename,
          desc,
          "Export",
          "File Name"
        );

        if (saveDialogResult.err === 0 && saveDialogResult.data) {
          let targetPath: string = saveDialogResult.data.trim();
          if (!targetPath.toLowerCase().endsWith(`.${extension}`)) {
            targetPath += `.${extension}`;
          }

          const nodeReq = getNodeRequire();
          if (nodeReq) {
            try {
              const fs = nodeReq("fs");
              fs.writeFileSync(targetPath, content, "utf8");
              const base = targetPath.split(/[/\\]/).pop() || targetPath;
              return { success: true, message: `Exported: ${base}`, filePath: targetPath };
            } catch (nodeErr) {
              console.warn("Node writeFileSync failed, trying cep.fs:", nodeErr);
            }
          }

          const writeRes = cepFs.writeFile(targetPath, content, (window as any).cep?.encoding?.UTF8 || 1);
          if (writeRes.err === 0) {
            const base = targetPath.split(/[/\\]/).pop() || targetPath;
            return { success: true, message: `Exported: ${base}`, filePath: targetPath };
          } else {
            throw new Error(`Failed to write file (CEP code ${writeRes.err})`);
          }
        } else if (saveDialogResult.err === 0 && !saveDialogResult.data) {
          return { success: false, message: "Export cancelled." };
        }
      }
    } catch (cepErr: any) {
      console.warn("CEP Save Dialog error, falling back to download:", cepErr);
    }
  }

  // Fallback for browser testing
  downloadTextFile(
    content,
    defaultFilename,
    extension === "srt" ? "text/plain;charset=utf-8" : "text/vtt;charset=utf-8"
  );
  return { success: true, message: `Exported ${defaultFilename}` };
}

/**
 * Downloads text as a file using standard browser download link (used as fallback).
 */
export function downloadTextFile(content: string, filename: string, mimeType = "text/plain;charset=utf-8"): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 200);
}

/**
 * Converts an AudioBuffer into a 16-bit PCM WAV Blob.
 */
export function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;

  const numFrames = buffer.length;
  const dataByteCount = numFrames * blockAlign;
  const bufferLength = 44 + dataByteCount;

  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);

  function writeString(offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  // RIFF header
  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataByteCount, true);
  writeString(8, "WAVE");
  // fmt chunk
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  // data chunk
  writeString(36, "data");
  view.setUint32(40, dataByteCount, true);

  // Interleave channel samples
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push(buffer.getChannelData(ch));
  }

  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      let sample = channels[ch][i];
      sample = Math.max(-1, Math.min(1, sample));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

let cachedSourceBlob: Blob | null = null;
let cachedDecodedAudio: AudioBuffer | null = null;
let activeDecodePromise: Promise<AudioBuffer> | null = null;

export function clearAudioDecodeCache(): void {
  cachedSourceBlob = null;
  cachedDecodedAudio = null;
  activeDecodePromise = null;
}

/**
 * Returns a cached AudioBuffer or decodes the source audio Blob once.
 * This completely avoids re-decoding large audio files on every caption retry.
 */
export async function getOrDecodeAudioBuffer(sourceBlob: Blob): Promise<AudioBuffer> {
  if (cachedSourceBlob === sourceBlob && cachedDecodedAudio) {
    return cachedDecodedAudio;
  }
  if (cachedSourceBlob === sourceBlob && activeDecodePromise) {
    return activeDecodePromise;
  }

  cachedSourceBlob = sourceBlob;
  cachedDecodedAudio = null;

  activeDecodePromise = (async () => {
    const AudioContextClass =
      typeof window !== "undefined"
        ? window.AudioContext || (window as any).webkitAudioContext
        : null;

    if (!AudioContextClass) {
      throw new Error("AudioContext is not supported in this environment.");
    }

    const audioCtx = new AudioContextClass();
    try {
      const arrayBuf = await sourceBlob.arrayBuffer();
      const decoded = await audioCtx.decodeAudioData(arrayBuf);
      cachedDecodedAudio = decoded;
      return decoded;
    } finally {
      if (typeof audioCtx.close === "function") {
        audioCtx.close().catch(() => {});
      }
    }
  })();

  return activeDecodePromise;
}

/**
 * Extracts a specific audio segment from a Blob between startTime and endTime in seconds.
 * Adds a small optional safety padding (e.g. 0.05s) to avoid clipping beginning/end of speech.
 * Uses cached AudioBuffer so repeated slicing is instantaneous (< 2ms).
 */
export async function sliceAudioBlob(
  sourceBlob: Blob,
  startTimeSec: number,
  endTimeSec: number,
  paddingSec = 0.05
): Promise<Blob> {
  const decoded = await getOrDecodeAudioBuffer(sourceBlob);

  const sampleRate = decoded.sampleRate;
  const paddedStart = Math.max(0, startTimeSec - paddingSec);
  const paddedEnd = Math.min(decoded.duration, endTimeSec + paddingSec);

  const startFrame = Math.max(0, Math.floor(paddedStart * sampleRate));
  const endFrame = Math.min(decoded.length, Math.ceil(paddedEnd * sampleRate));
  const frameCount = Math.max(1, endFrame - startFrame);
  const numChannels = decoded.numberOfChannels;

  const AudioContextClass =
    typeof window !== "undefined"
      ? window.AudioContext || (window as any).webkitAudioContext
      : null;

  let sliced: AudioBuffer;
  if (AudioContextClass) {
    const tempCtx = new AudioContextClass();
    sliced = tempCtx.createBuffer(numChannels, frameCount, sampleRate);
    if (typeof tempCtx.close === "function") tempCtx.close().catch(() => {});
  } else {
    sliced = {
      numberOfChannels: numChannels,
      sampleRate,
      length: frameCount,
      duration: frameCount / sampleRate,
      getChannelData: () => new Float32Array(frameCount)
    } as any;
  }

  for (let ch = 0; ch < numChannels; ch++) {
    const srcData = decoded.getChannelData(ch);
    const dstData = sliced.getChannelData(ch);
    dstData.set(srcData.subarray(startFrame, endFrame));
  }

  return audioBufferToWavBlob(sliced);
}

/**
 * Saves content to a file in the system temp directory and imports it
 * into the active Premiere Pro project bin via ExtendScript.
 */
export async function importSubtitlesIntoPremiere(
  content: string,
  filename = "AutoCap_Subtitles.srt"
): Promise<{ success: boolean; message: string; filePath?: string }> {
  if (!isCep()) {
    // Fallback in browser: download file directly
    downloadTextFile(content, filename);
    return {
      success: true,
      message: "Downloaded subtitle file (Drag into Premiere Pro)."
    };
  }

  try {
    const cepFs = (window as any).cep?.fs;
    const nodeReq = getNodeRequire();
    let tempDir = "";

    // 1. Determine directory path
    if (typeof (window as any).__adobe_cep__?.getSystemPath === "function") {
      tempDir = (window as any).__adobe_cep__.getSystemPath("temporary") || "";
    }

    if (!tempDir && nodeReq) {
      try {
        const os = nodeReq("os");
        tempDir = os.tmpdir();
      } catch { /* ignore */ }
    }

    if (!tempDir) tempDir = "C:/Windows/Temp";

    // Normalize path with forward slashes for ExtendScript
    const normalizedDir = tempDir.replace(/\\/g, "/").replace(/\/+$/, "");
    const safeTimestamp = Date.now();
    const filePath = `${normalizedDir}/AutoCap_${safeTimestamp}.srt`;

    // 2. Write file to disk
    let fileWritten = false;
    if (nodeReq) {
      try {
        const fs = nodeReq("fs");
        fs.writeFileSync(filePath, content, "utf8");
        fileWritten = true;
      } catch (nodeErr) {
        console.warn("Node writeFileSync failed in importSubtitles:", nodeErr);
      }
    }

    if (!fileWritten && cepFs && typeof cepFs.writeFile === "function") {
      const writeResult = cepFs.writeFile(filePath, content, (window as any).cep?.encoding?.UTF8 || 1);
      fileWritten = writeResult?.err === 0;
    }

    if (!fileWritten) {
      const expRes = await exportSubtitleFile(content, filename, "srt");
      return {
        success: expRes.success,
        message: expRes.success
          ? "Saved subtitle file to disk. Drag it into your Premiere Pro sequence."
          : expRes.message
      };
    }

    // 3. Call ExtendScript to import the file into Premiere Pro
    // In Premiere Pro ExtendScript, app.project.importFiles() returns undefined (not a boolean).
    // We check success by catching errors and verifying rootItem items.
    const extendScript = `
      (function() {
        try {
          if (!app.project) return JSON.stringify({ error: "No open Premiere Pro project." });
          var importPath = "${filePath}";
          var fileObj = new File(importPath);
          if (!fileObj.exists) return JSON.stringify({ error: "File not found on disk: " + importPath });
          
          app.project.importFiles([importPath], true, app.project.rootItem, false);
          
          var itemName = fileObj.name;
          var importedItem = null;
          for (var i = 0; i < app.project.rootItem.children.numItems; i++) {
            var item = app.project.rootItem.children[i];
            if (item && item.name && (item.name.indexOf("AutoCap") !== -1 || item.getMediaPath() === importPath)) {
              itemName = item.name;
              importedItem = item;
              break;
            }
          }
          
          var placedOnTimeline = false;
          var seq = app.project.activeSequence;
          if (seq && importedItem) {
            try {
              if (seq.videoTracks && seq.videoTracks.numTracks > 0) {
                var topTrack = seq.videoTracks[seq.videoTracks.numTracks - 1];
                if (topTrack) {
                  topTrack.insertClip(importedItem, 0);
                  placedOnTimeline = true;
                }
              }
            } catch (tlErr) {
              // Gracefully continue if direct track insertion requires user drag
            }
          }

          return JSON.stringify({
            success: true,
            filePath: importPath,
            itemName: itemName,
            placedOnTimeline: placedOnTimeline
          });
        } catch (err) {
          return JSON.stringify({ error: err.toString() });
        }
      })();
    `;

    const rawResult = await evalExtendScript(extendScript);
    let parsed: any = {};
    try {
      parsed = JSON.parse(rawResult);
    } catch {
      parsed = { error: rawResult };
    }

    if (parsed.success) {
      const placementNote = parsed.placedOnTimeline
        ? "Inserted directly onto sequence timeline!"
        : `Imported to Project bin ("${parsed.itemName}"). Drag onto timeline.`;
      return {
        success: true,
        message: `Subtitles imported! ${placementNote}`,
        filePath
      };
    } else {
      console.warn("ExtendScript import error:", parsed.error);
      const expRes = await exportSubtitleFile(content, filename, "srt");
      return {
        success: true,
        message: `Saved SRT to disk (${parsed.error || "Drag into Premiere"}).`
      };
    }
  } catch (err: any) {
    const expRes = await exportSubtitleFile(content, filename, "srt");
    return {
      success: true,
      message: `Saved SRT file: ${expRes.message}`
    };
  }
}
