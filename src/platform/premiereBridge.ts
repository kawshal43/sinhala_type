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
  error?: string;
}

/**
 * Retrieves the active Premiere Pro sequence's audio tracks and their clip media paths.
 */
export async function getSequenceAudioTracks(): Promise<ActiveSequenceInfo> {
  if (!isCep()) {
    // Return sample demo data when running in browser mode
    return {
      sequenceName: "Demo Sequence",
      tracks: [
        {
          index: 0,
          name: "Audio 1 (Voiceover)",
          isMuted: false,
          clipCount: 1,
          clips: [{ name: "voiceover.wav", mediaPath: "C:/Projects/voiceover.wav", inPoint: 0, outPoint: 45, duration: 45 }]
        },
        {
          index: 1,
          name: "Audio 2 (Music)",
          isMuted: false,
          clipCount: 1,
          clips: [{ name: "bg_music.mp3", mediaPath: "C:/Projects/bg_music.mp3", inPoint: 0, outPoint: 60, duration: 60 }]
        }
      ]
    };
  }

  const script = `
    (function() {
      try {
        if (!app.project || !app.project.activeSequence) {
          return JSON.stringify({ error: "No active sequence opened in Premiere Pro." });
        }
        var seq = app.project.activeSequence;
        var tracks = [];
        var numAudio = seq.audioTracks.numTracks;
        for (var i = 0; i < numAudio; i++) {
          var track = seq.audioTracks[i];
          var clips = [];
          for (var c = 0; c < track.clips.numItems; c++) {
            var clip = track.clips[c];
            var mediaPath = "";
            try {
              if (clip.projectItem) {
                mediaPath = clip.projectItem.getMediaPath();
              }
            } catch (e) {}
            clips.push({
              name: clip.name || ("Clip " + (c + 1)),
              mediaPath: mediaPath || "",
              inPoint: clip.inPoint ? clip.inPoint.seconds : 0,
              outPoint: clip.outPoint ? clip.outPoint.seconds : 0,
              duration: clip.duration ? clip.duration.seconds : 0
            });
          }
          tracks.push({
            index: i,
            name: track.name || ("Audio " + (i + 1)),
            isMuted: track.isMuted ? track.isMuted() : false,
            clipCount: track.clips.numItems,
            clips: clips
          });
        }
        return JSON.stringify({
          sequenceName: seq.name,
          tracks: tracks
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
  // Strip all whitespace, newlines (\r, \n), and invalid characters which cause "Invalid character" DOMException
  const cleaned = base64.replace(/[^A-Za-z0-9+/=]/g, "");
  const remainder = cleaned.length % 4;
  const padded = remainder === 0 ? cleaned : cleaned + "=".repeat(4 - remainder);

  const atobFn =
    typeof window !== "undefined" && typeof window.atob === "function"
      ? (s: string) => window.atob(s)
      : (s: string) => Buffer.from(s, "base64").toString("binary");

  // Decode in 64KB chunks to prevent maximum call-stack or string-length limits
  const chunkSize = 65536; // multiple of 4
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

  // Strategy 1: Node.js fs (fastest, memory-efficient binary stream)
  const nodeReq = getNodeRequire();
  if (nodeReq) {
    try {
      const fs = nodeReq("fs");
      if (fs && typeof fs.readFileSync === "function") {
        onProgress?.(30, `Reading file with Node.js...`);
        const buffer = fs.readFileSync(cleanPath);
        onProgress?.(80, `Processing audio data...`);
        const blob = new Blob([buffer], { type: mimeType });
        onProgress?.(100, `Audio loaded!`);
        return { blob, filename };
      }
    } catch (nodeErr: any) {
      console.warn("Node.js file read error, trying native CEP fs:", nodeErr);
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

/**
 * Downloads text as a file using standard browser download link.
 */
export function downloadTextFile(content: string, filename: string, mimeType = "text/plain;charset=utf-8"): void {
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
 * Saves content to a file in the system temp directory and imports it
 * into the active Premiere Pro project bin via ExtendScript.
 */
export async function importSubtitlesIntoPremiere(
  content: string,
  filename = "AutoCap_Subtitles.srt"
): Promise<{ success: boolean; message: string }> {
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
    let tempDir = "";

    // 1. Determine temporary directory path
    if (typeof (window as any).__adobe_cep__?.getSystemPath === "function") {
      tempDir = (window as any).__adobe_cep__.getSystemPath("temporary") || "";
    }

    if (!tempDir && typeof (window as any).require === "function") {
      try {
        const os = (window as any).require("os");
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
    if (cepFs && typeof cepFs.writeFile === "function") {
      const writeResult = cepFs.writeFile(filePath, content, (window as any).cep?.encoding?.UTF8);
      fileWritten = writeResult?.err === 0;
    }

    if (!fileWritten && typeof (window as any).require === "function") {
      try {
        const fs = (window as any).require("fs");
        fs.writeFileSync(filePath, content, "utf8");
        fileWritten = true;
      } catch { /* ignore */ }
    }

    if (!fileWritten) {
      downloadTextFile(content, filename);
      return {
        success: true,
        message: "Saved subtitle file. Drag it into your Premiere Pro sequence."
      };
    }

    // 3. Call ExtendScript to import the file into Premiere Pro
    const extendScript = `
      (function() {
        try {
          if (!app.project) return "NO_PROJECT";
          var importPath = "${filePath}";
          var fileObj = new File(importPath);
          if (!fileObj.exists) return "FILE_NOT_FOUND";
          var success = app.project.importFiles([importPath], true, app.project.rootItem, false);
          return success ? "SUCCESS" : "IMPORT_FAILED";
        } catch (err) {
          return "ERROR: " + err.toString();
        }
      })();
    `;

    const result = await evalExtendScript(extendScript);

    if (result === "SUCCESS") {
      return {
        success: true,
        message: "Subtitles imported to Premiere Pro Project bin! Drag to timeline."
      };
    } else if (result === "NO_PROJECT") {
      downloadTextFile(content, filename);
      return {
        success: false,
        message: "No open Premiere Pro project. Downloaded SRT file instead."
      };
    } else {
      downloadTextFile(content, filename);
      return {
        success: true,
        message: `SRT file created. Result: ${result}. File downloaded.`
      };
    }
  } catch (err: any) {
    downloadTextFile(content, filename);
    return {
      success: true,
      message: `Downloaded SRT file (${err?.message || "Saved locally"}).`
    };
  }
}
