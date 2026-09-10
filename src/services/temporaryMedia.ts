function getNodeModule(name: string): any {
  if (typeof window !== "undefined" && typeof (window as any).require === "function") {
    try {
      return (window as any).require(name);
    } catch {
      return null;
    }
  }
  if (typeof globalThis !== "undefined" && typeof (globalThis as any).require === "function") {
    try {
      return (globalThis as any).require(name);
    } catch {
      return null;
    }
  }
  return null;
}

export class TemporaryMediaManager {
  private activeTempFiles: Set<string> = new Set();
  private lockedJobAudio: Map<string, string> = new Map();

  /**
   * Generates a unique temporary file path for timeline audio export.
   */
  public createTempAudioPath(jobId: string, ext = ".wav"): string {
    const os = getNodeModule("os");
    const path = getNodeModule("path");
    const tempDir = os?.tmpdir?.() || "C:/Windows/Temp";
    const safeExt = ext.startsWith(".") ? ext : `.${ext}`;
    const filename = `autocap_export_${jobId}_${Date.now()}${safeExt}`;
    const fullPath = path ? path.join(tempDir, filename) : `${tempDir}/${filename}`;
    const normalized = fullPath.replace(/\\/g, "/");
    this.activeTempFiles.add(normalized);
    this.lockedJobAudio.set(jobId, normalized);
    return normalized;
  }

  /**
   * Returns a durable directory path for persistent SRT exports and Premiere caption assets.
   * Unlike temp audio, these must survive OS temp cleanup because Premiere project references them.
   */
  public getDurableCaptionsDirectory(): string {
    const os = getNodeModule("os");
    const path = getNodeModule("path");
    const fs = getNodeModule("fs");

    let baseDir = "";
    if (os && os.homedir) {
      baseDir = path.join(os.homedir(), "Documents", "AutoCap Captions");
    } else {
      baseDir = "C:/AutoCap Captions";
    }

    if (fs && !fs.existsSync(baseDir)) {
      try {
        fs.mkdirSync(baseDir, { recursive: true });
      } catch {
        // fallback to temp if documents inaccessible
        baseDir = os?.tmpdir?.() || "C:/Windows/Temp";
      }
    }

    return baseDir.replace(/\\/g, "/");
  }

  /**
   * Creates a unique durable SRT file path for importing into Premiere Pro.
   */
  public createDurableSrtPath(sequenceName: string): string {
    const dir = this.getDurableCaptionsDirectory();
    const safeSeq = (sequenceName || "Sequence").replace(/[^a-zA-Z0-9_\u0D80-\u0DFF-]/g, "_").slice(0, 32);
    const filename = `AutoCap_${safeSeq}_${Date.now()}.srt`;
    return `${dir}/${filename}`;
  }

  /**
   * Deletes a temporary audio file from disk if it is tracked and not locked.
   */
  public cleanupTempFile(filePath: string): boolean {
    if (!filePath) return false;
    const normalized = filePath.replace(/\\/g, "/");
    this.activeTempFiles.delete(normalized);

    const fs = getNodeModule("fs");
    if (!fs) return false;

    try {
      if (fs.existsSync(normalized)) {
        fs.unlinkSync(normalized);
        return true;
      }
    } catch (err) {
      console.warn("Could not delete temporary audio file:", normalized, err);
    }
    return false;
  }

  /**
   * Cleans up audio associated with a finished or cancelled job.
   */
  public cleanupJobAudio(jobId: string): void {
    const audioPath = this.lockedJobAudio.get(jobId);
    if (audioPath) {
      this.cleanupTempFile(audioPath);
      this.lockedJobAudio.delete(jobId);
    }
  }

  /**
   * Releases or cleans up previous temporary files when a new transcription starts or document is closed.
   */
  public releasePreviousDocuments(exceptJobId?: string): void {
    for (const [jobId, path] of this.lockedJobAudio.entries()) {
      if (exceptJobId && jobId === exceptJobId) continue;
      this.cleanupTempFile(path);
      this.lockedJobAudio.delete(jobId);
    }
  }
}

export const temporaryMedia = new TemporaryMediaManager();
