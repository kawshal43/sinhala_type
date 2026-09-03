/**
 * Incomplete job persistence and session recovery.
 * Implements Phase 4 of the AutoCap Product Architecture:
 * - Saves completed chunk progress per media hash
 * - Allows resuming interrupted or paused transcription jobs without restarting from scratch
 * - Automatically clears job state upon complete successful transcription
 */

import type { SubtitleCue } from "../core/subtitles/srtParser";
import type { TranscribeResult } from "./sttService";

export interface IncompleteJobRecord {
  cacheKey: string;
  totalChunks: number;
  completedChunks: Record<number, TranscribeResult>;
  cues: SubtitleCue[];
  updatedAt: number;
}

const STORAGE_PREFIX = "autocap.job.";

function getNodeReq(): any {
  if (typeof window !== "undefined" && typeof (window as any)?.require === "function") {
    return (window as any).require;
  }
  if (typeof require === "function") {
    return require;
  }
  return null;
}

function getRecoveryFilePath(): string | null {
  const nodeReq = getNodeReq();
  if (!nodeReq) return null;
  try {
    const os = nodeReq("os");
    const path = nodeReq("path");
    return path.join(os.tmpdir(), "autocap-active-jobs.json");
  } catch {
    return null;
  }
}

function readDiskJobs(): Record<string, IncompleteJobRecord> {
  const filePath = getRecoveryFilePath();
  if (!filePath) return {};
  const nodeReq = getNodeReq();
  try {
    const fs = nodeReq("fs");
    if (!fs.existsSync(filePath)) return {};
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) || {};
  } catch {
    return {};
  }
}

function writeDiskJobs(jobs: Record<string, IncompleteJobRecord>): void {
  const filePath = getRecoveryFilePath();
  if (!filePath) return;
  const nodeReq = getNodeReq();
  try {
    const fs = nodeReq("fs");
    fs.writeFileSync(filePath, JSON.stringify(jobs), "utf-8");
  } catch {
    // Disk write error must never fail application
  }
}

const memoryJobCache = new Map<string, IncompleteJobRecord>();

export function saveIncompleteJob(record: IncompleteJobRecord): void {
  memoryJobCache.set(record.cacheKey, record);

  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(`${STORAGE_PREFIX}${record.cacheKey}`, JSON.stringify(record));
    }
  } catch {}

  const diskJobs = readDiskJobs();
  diskJobs[record.cacheKey] = record;
  writeDiskJobs(diskJobs);
}

export function getIncompleteJob(cacheKey: string): IncompleteJobRecord | null {
  // Try in-memory first
  if (memoryJobCache.has(cacheKey)) {
    return memoryJobCache.get(cacheKey)!;
  }

  // Try localStorage
  try {
    if (typeof localStorage !== "undefined") {
      const data = localStorage.getItem(`${STORAGE_PREFIX}${cacheKey}`);
      if (data) {
        const parsed = JSON.parse(data);
        memoryJobCache.set(cacheKey, parsed);
        return parsed;
      }
    }
  } catch {}

  // Fallback to disk jobs
  const diskJobs = readDiskJobs();
  const diskRecord = diskJobs[cacheKey] || null;
  if (diskRecord) {
    memoryJobCache.set(cacheKey, diskRecord);
  }
  return diskRecord;
}

export function clearIncompleteJob(cacheKey: string): void {
  memoryJobCache.delete(cacheKey);

  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(`${STORAGE_PREFIX}${cacheKey}`);
    }
  } catch {}

  const diskJobs = readDiskJobs();
  if (diskJobs[cacheKey]) {
    delete diskJobs[cacheKey];
    writeDiskJobs(diskJobs);
  }
}
