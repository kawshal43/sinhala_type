const STORAGE_KEY = "sinhalatype.userDictionary.v1";

export function loadUserDictionary(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"); }
  catch { return {}; }
}

export function saveUserDictionary(value: Record<string, string>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}
