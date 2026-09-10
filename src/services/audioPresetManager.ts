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
            let formatSuggestion = "Export Preset";
            if (/wav|wave|audio/i.test(baseName)) {
              formatSuggestion = "WAV Audio";
            } else if (/aac|m4a|mp3/i.test(baseName)) {
              formatSuggestion = "Compressed Audio";
            }
            results.push({
              path: fullPath.replace(/\\/g, "/"),
              name: baseName,
              isCustom: true,
              formatSuggestion
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
  public validatePreset(presetPath: string): { valid: boolean; reason?: string } {
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
      return { valid: true };
    } catch (err: any) {
      return { valid: false, reason: err.message || "Failed to inspect preset file." };
    }
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
