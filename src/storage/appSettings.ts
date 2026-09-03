export type SttProvider = "auto" | "gemini" | "groq" | "openai" | "webspeech";
export type LanguageChoice = "si" | "en" | "auto";
export type DefaultEncoding = "unicode" | "wije" | "isi";

export interface AppSettings {
  sttProvider: SttProvider;
  groqApiKey: string;
  openaiApiKey: string;
  geminiApiKey: string;
  language: LanguageChoice;
  defaultEncoding: DefaultEncoding;
  maxCpl: number;
}

const SETTINGS_KEY = "autocap.settings.v1";

const DEFAULT_SETTINGS: AppSettings = {
  sttProvider: "gemini",
  groqApiKey: "",
  openaiApiKey: "",
  geminiApiKey: "",
  language: "auto",
  defaultEncoding: "unicode",
  maxCpl: 38
};

// In-memory cache fallback
let memorySettings: AppSettings | null = null;

function getNodeReq(): any {
  if (typeof window !== "undefined" && typeof (window as any)?.require === "function") {
    return (window as any).require;
  }
  if (typeof globalThis !== "undefined" && typeof (globalThis as any)?.require === "function") {
    return (globalThis as any).require;
  }
  return null;
}

function getDiskConfigFilePaths(): string[] {
  const nodeReq = getNodeReq();
  if (!nodeReq) return [];
  const paths: string[] = [];
  try {
    const os = nodeReq("os");
    const path = nodeReq("path");
    const home = os.homedir?.() || "";
    if (home) {
      paths.push(path.join(home, ".autocap-config.json"));
    }
    const tmp = os.tmpdir?.() || "";
    if (tmp) {
      paths.push(path.join(tmp, "autocap-config.json"));
    }
  } catch {
    // ignore
  }
  return paths;
}

function readFromDisk(): Partial<AppSettings> | null {
  const nodeReq = getNodeReq();
  if (!nodeReq) return null;
  try {
    const fs = nodeReq("fs");
    const paths = getDiskConfigFilePaths();
    for (const p of paths) {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, "utf8");
        if (raw && raw.trim()) {
          return JSON.parse(raw);
        }
      }
    }
  } catch {
    // fallback
  }
  return null;
}

function writeToDisk(settings: AppSettings): void {
  const nodeReq = getNodeReq();
  if (!nodeReq) return;
  try {
    const fs = nodeReq("fs");
    const paths = getDiskConfigFilePaths();
    const payload = JSON.stringify(settings, null, 2);
    for (const p of paths) {
      try {
        fs.writeFileSync(p, payload, "utf8");
      } catch {
        // try next path
      }
    }
  } catch {
    // ignore
  }
}

/**
 * Loads application settings with multi-tier persistence:
 * 1. Persistent host disk file (~/.autocap-config.json) - survives CEP cache clears & reinstall
 * 2. Browser localStorage
 * 3. In-memory fallback
 */
export function loadSettings(): AppSettings {
  let diskData: Partial<AppSettings> | null = null;
  try {
    diskData = readFromDisk();
  } catch {
    diskData = null;
  }

  let localData: Partial<AppSettings> | null = null;
  if (typeof localStorage !== "undefined") {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) localData = JSON.parse(raw);
    } catch {
      localData = null;
    }
  }

  const merged: AppSettings = {
    ...DEFAULT_SETTINGS,
    ...(localData || {}),
    ...(diskData || {}),
    ...(memorySettings || {})
  };

  memorySettings = merged;

  // Mirror back to localStorage and disk if needed
  if (typeof localStorage !== "undefined" && !localData && diskData) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
    } catch {}
  }

  return merged;
}

/**
 * Saves application settings across all tiers (LocalStorage + Host Disk + Memory).
 */
export function saveSettings(settings: AppSettings): void {
  memorySettings = { ...settings };

  // 1. Browser LocalStorage
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // ignore
    }
  }

  // 2. Persistent Host Disk File
  writeToDisk(settings);
}
