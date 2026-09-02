/**
 * Utility functions for handling subtitle timestamps.
 */

export function padZero(num: number, size = 2): string {
  let s = Math.floor(Math.max(0, num)).toString();
  while (s.length < size) s = "0" + s;
  return s;
}

/**
 * Formats seconds into SRT timestamp format: HH:MM:SS,mmm
 * Example: 75.123 -> "00:01:15,123"
 */
export function formatSrtTime(totalSeconds: number): string {
  if (isNaN(totalSeconds) || totalSeconds < 0) totalSeconds = 0;
  const totalMs = Math.round(totalSeconds * 1000);
  const hours = Math.floor(totalMs / 3600000);
  const minutes = Math.floor((totalMs % 3600000) / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const milliseconds = totalMs % 1000;

  return `${padZero(hours)}:${padZero(minutes)}:${padZero(seconds)},${padZero(milliseconds, 3)}`;
}

/**
 * Formats seconds into WebVTT timestamp format: HH:MM:SS.mmm
 * Example: 75.123 -> "00:01:15.123"
 */
export function formatVttTime(totalSeconds: number): string {
  if (isNaN(totalSeconds) || totalSeconds < 0) totalSeconds = 0;
  const totalMs = Math.round(totalSeconds * 1000);
  const hours = Math.floor(totalMs / 3600000);
  const minutes = Math.floor((totalMs % 3600000) / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const milliseconds = totalMs % 1000;

  return `${padZero(hours)}:${padZero(minutes)}:${padZero(seconds)}.${padZero(milliseconds, 3)}`;
}

/**
 * Parses timestamp string (either SRT "00:01:15,123" or VTT "00:01:15.123" or short "01:15.123")
 * into total seconds as a floating point number.
 */
export function parseTimestamp(timeString: string): number {
  if (!timeString || typeof timeString !== "string") return 0;
  const normalized = timeString.trim().replace(",", ".");
  const parts = normalized.split(":");

  if (parts.length === 3) {
    const hours = parseFloat(parts[0]) || 0;
    const minutes = parseFloat(parts[1]) || 0;
    const seconds = parseFloat(parts[2]) || 0;
    return hours * 3600 + minutes * 60 + seconds;
  } else if (parts.length === 2) {
    const minutes = parseFloat(parts[0]) || 0;
    const seconds = parseFloat(parts[1]) || 0;
    return minutes * 60 + seconds;
  } else if (parts.length === 1) {
    return parseFloat(parts[0]) || 0;
  }
  return 0;
}

/**
 * Formats duration for human readability in UI (e.g. "01:23" or "1h 05m")
 */
export function formatDisplayDuration(totalSeconds: number): string {
  if (isNaN(totalSeconds) || totalSeconds <= 0) return "00:00";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  if (hours > 0) {
    return `${hours}:${padZero(minutes)}:${padZero(seconds)}`;
  }
  return `${padZero(minutes)}:${padZero(seconds)}`;
}
