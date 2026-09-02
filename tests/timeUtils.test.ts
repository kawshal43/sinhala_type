import { describe, expect, it } from "vitest";
import { formatDisplayDuration, formatSrtTime, formatVttTime, parseTimestamp } from "../src/core/subtitles/timeUtils";

describe("timeUtils", () => {
  it("formats SRT timestamps correctly", () => {
    expect(formatSrtTime(0)).toBe("00:00:00,000");
    expect(formatSrtTime(1.5)).toBe("00:00:01,500");
    expect(formatSrtTime(65.123)).toBe("00:01:05,123");
    expect(formatSrtTime(3665.456)).toBe("01:01:05,456");
  });

  it("formats WebVTT timestamps correctly", () => {
    expect(formatVttTime(0)).toBe("00:00:00.000");
    expect(formatVttTime(75.89)).toBe("00:01:15.890");
    expect(formatVttTime(3600)).toBe("01:00:00.000");
  });

  it("parses SRT and VTT timestamps to seconds", () => {
    expect(parseTimestamp("00:00:00,000")).toBe(0);
    expect(parseTimestamp("00:01:05,123")).toBeCloseTo(65.123, 3);
    expect(parseTimestamp("00:01:15.890")).toBeCloseTo(75.89, 3);
    expect(parseTimestamp("01:15.500")).toBeCloseTo(75.5, 3);
    expect(parseTimestamp("10.5")).toBeCloseTo(10.5, 3);
    expect(parseTimestamp("")).toBe(0);
  });

  it("formats display duration correctly", () => {
    expect(formatDisplayDuration(0)).toBe("00:00");
    expect(formatDisplayDuration(45)).toBe("00:45");
    expect(formatDisplayDuration(125)).toBe("02:05");
    expect(formatDisplayDuration(3665)).toBe("1:01:05");
  });
});

