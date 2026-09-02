const STORAGE_KEY = "autocap.userDictionary.v1";
const LEGACY_STORAGE_KEY = "sinhalatype.userDictionary.v1";

export function loadUserDictionary(): Record<string, string> {
  try {
    const data = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
    return JSON.parse(data ?? "{}");
  } catch {
    return {};
  }
}

export function saveUserDictionary(value: Record<string, string>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}
