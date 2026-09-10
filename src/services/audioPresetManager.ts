import { loadSettings, saveSettings } from "../storage/appSettings";

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

export interface PresetInfo {
  path: string;
  name: string;
  isCustom: boolean;
  formatSuggestion: string;
}

export interface PresetValidation {
  valid: boolean;
  reason?: string;
}

/** Premiere's direct exporter requires the output extension to match the EPR.
 * AutoCap writes WAV files, so only audio-only Waveform Audio presets qualify.
 */
export function validateWavPresetContent(content: string): PresetValidation {
  if (!/<DoAudio>\s*true\s*<\/DoAudio>/i.test(content)) {
    return { valid: false, reason: "The preset does not have audio export enabled." };
  }
  if (!/<DoVideo>\s*false\s*<\/DoVideo>/i.test(content)) {
    return { valid: false, reason: "The preset includes video. Create an audio-only Waveform Audio preset." };
  }

  const isWaveform =
    /<ExporterFileType>\s*1463899717\s*<\/ExporterFileType>/i.test(content) || // FourCC WAVE
    /waveform|wave audio|\bwave\b|\bpcm\b/i.test(content);
  if (!isWaveform || /<ParamAuxValue>\s*AAC\s*<\/ParamAuxValue>/i.test(content)) {
    return { valid: false, reason: "The preset is not Waveform Audio (WAV/PCM)." };
  }
  return { valid: true };
}

export class AudioPresetManager {
  /**
   * Scans known Premiere Pro and Adobe Media Encoder preset directories
   * for .epr export preset files.
   */
  public async discoverPresets(): Promise<PresetInfo[]> {
    const nodeReq = getNodeReq();
    if (!nodeReq) return [];

    const fs = nodeReq("fs");
    const path = nodeReq("path");
    const os = nodeReq("os");
    if (!fs || !path || !os) return [];

    const results: PresetInfo[] = [];
    const searchDirs: string[] = [];

    const homeDir = os.homedir?.() || "";
    const appData = process.env.APPDATA || (homeDir ? path.join(homeDir, "AppData", "Roaming") : "");

    if (homeDir) {
      // 1. Premiere Pro user presets
      const pproDocs = path.join(homeDir, "Documents", "Adobe", "Premiere Pro");
      if (fs.existsSync(pproDocs)) {
        try {
          const versions = fs.readdirSync(pproDocs);
          for (const v of versions) {
            const vPath = path.join(pproDocs, v);
            if (fs.statSync(vPath).isDirectory()) {
              // Check Profile directory
              try {
                const subDirs = fs.readdirSync(vPath);
                for (const sd of subDirs) {
                  if (sd.startsWith("Profile-")) {
                    searchDirs.push(path.join(vPath, sd, "Settings", "Custom"));
                  }
                }
              } catch {}
            }
          }
        } catch {}
      }

      // 2. Media Encoder user presets
      const ameDocs = path.join(homeDir, "Documents", "Adobe", "Adobe Media Encoder");
      if (fs.existsSync(ameDocs)) {
        try {
          const ameVers = fs.readdirSync(ameDocs);
          for (const av of ameVers) {
            searchDirs.push(path.join(ameDocs, av, "Presets"));
          }
        } catch {}
      }
    }

    if (appData) {
      // 3. Adobe Common Presets
      searchDirs.push(path.join(appData, "Adobe", "Common", "AME"));
      searchDirs.push(path.join(appData, "Adobe", "Adobe Media Encoder"));
    }

    // Recursively find .epr files
    function scanDir(dir: string, depth = 0) {
      if (depth > 3 || !fs.existsSync(dir)) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            scanDir(fullPath, depth + 1);
          } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".epr")) {
            const baseName = entry.name.replace(/\.epr$/i, "");
            const validation = validateWavPresetContent(fs.readFileSync(fullPath, "utf8"));
            if (!validation.valid) continue;
            results.push({
              path: fullPath.replace(/\\/g, "/"),
              name: baseName,
              isCustom: true,
              formatSuggestion: "WAV Audio"
            });
          }
        }
      } catch {}
    }

    for (const d of searchDirs) {
      scanDir(d);
    }

    // Deduplicate by normalized path
    const unique = new Map<string, PresetInfo>();
    for (const item of results) {
      if (!unique.has(item.path)) {
        unique.set(item.path, item);
      }
    }

    return Array.from(unique.values());
  }

  /**
   * Validates if a preset path exists and is an .epr file.
   */
  public validatePreset(presetPath: string): PresetValidation {
    if (!presetPath || !presetPath.trim()) {
      return { valid: false, reason: "No preset path specified." };
    }
    const nodeReq = getNodeReq();
    if (!nodeReq) {
      // In browser test mode
      return { valid: presetPath.endsWith(".epr") };
    }

    const fs = nodeReq("fs");
    if (!fs) return { valid: true };

    try {
      if (!fs.existsSync(presetPath)) {
        return { valid: false, reason: "Preset file does not exist on disk." };
      }
      const stat = fs.statSync(presetPath);
      if (!stat.isFile() || stat.size === 0) {
        return { valid: false, reason: "Preset file is empty or not a valid file." };
      }
      if (!presetPath.toLowerCase().endsWith(".epr")) {
        return { valid: false, reason: "File is not an Adobe .epr export preset." };
      }
      const content = fs.readFileSync(presetPath, "utf8");
      return validateWavPresetContent(content);
    } catch (err: any) {
      return { valid: false, reason: err.message || "Failed to inspect preset file." };
    }
  }

  /** Returns the saved compatible preset, or discovers and remembers one. */
  public async resolveCompatiblePresetPath(): Promise<string> {
    const configured = this.getSelectedPresetPath();
    if (configured && this.validatePreset(configured).valid) return configured;

    const discovered = await this.discoverPresets();
    if (discovered.length > 0) {
      this.setSelectedPresetPath(discovered[0].path);
      return discovered[0].path;
    }
    throw new Error(
      "No compatible WAV audio preset was found. In Premiere choose File > Export > Media > Waveform Audio, disable video, save the preset, then click Load again."
    );
  }

  /**
   * Gets the currently saved preset path from AppSettings or empty string.
   */
  public getSelectedPresetPath(): string {
    const settings = loadSettings();
    return (settings as any).audioPresetPath || "";
  }

  /**
   * Saves the selected preset path permanently to user settings.
   */
  public setSelectedPresetPath(presetPath: string): void {
    const settings = loadSettings();
    (settings as any).audioPresetPath = presetPath.trim();
    saveSettings(settings);
  }
}

export const audioPresetManager = new AudioPresetManager();
