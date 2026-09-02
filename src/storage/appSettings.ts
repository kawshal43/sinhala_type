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

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
