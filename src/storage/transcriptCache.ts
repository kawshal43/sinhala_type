import type { TranscribeResult } from "../services/sttService";
import type { AppSettings } from "./appSettings";

const DATABASE_NAME = "autocap-transcripts";
const STORE_NAME = "transcripts";
const CACHE_VERSION = 2;

interface CacheRecord {
  key: string;
  createdAt: number;
  result: TranscribeResult;
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function digest(value: Blob): Promise<string> {
  const bytes = await value.arrayBuffer();
  if (globalThis.crypto?.subtle) {
    const hash = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  let hash = 2166136261;
  for (const byte of new Uint8Array(bytes)) {
    hash ^= byte;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

export async function createTranscriptCacheKey(file: Blob, settings: AppSettings): Promise<string> {
  const audioHash = await digest(file);
  return `${CACHE_VERSION}:${audioHash}:${settings.sttProvider}:${settings.language}`;
}

function getNodeReq(): any {
  if (typeof window !== "undefined" && typeof (window as any)?.require === "function") {
    return (window as any).require;
  }
  return null;
}

function getDiskCacheFilePath(): string | null {
  const nodeReq = getNodeReq();
  if (!nodeReq) return null;
  try {
    const os = nodeReq("os");
    const path = nodeReq("path");
    return path.join(os.tmpdir(), "autocap-transcripts-cache.json");
  } catch {
    return null;
  }
}

function readDiskCache(key: string): TranscribeResult | null {
  const filePath = getDiskCacheFilePath();
  if (!filePath) return null;
  const nodeReq = getNodeReq();
  try {
    const fs = nodeReq("fs");
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(content);
    return parsed[key]?.result || null;
  } catch {
    return null;
  }
}

function writeDiskCache(key: string, result: TranscribeResult): void {
  const filePath = getDiskCacheFilePath();
  if (!filePath) return;
  const nodeReq = getNodeReq();
  try {
    const fs = nodeReq("fs");
    let data: Record<string, CacheRecord> = {};
    if (fs.existsSync(filePath)) {
      try {
        data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      } catch {}
    }
    data[key] = { key, createdAt: Date.now(), result };
    fs.writeFileSync(filePath, JSON.stringify(data), "utf-8");
  } catch {
    // Disk write error must never break app
  }
}

export async function getCachedTranscript(key: string): Promise<TranscribeResult | null> {
  try {
    const database = await openDatabase();
    if (database) {
      const fromIdb = await new Promise<TranscribeResult | null>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readonly");
        const request = transaction.objectStore(STORE_NAME).get(key);
        request.onsuccess = () => resolve((request.result as CacheRecord | undefined)?.result || null);
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => database.close();
      });
      if (fromIdb) return fromIdb;
    }
  } catch {
    // Fall back to disk cache
  }

  return readDiskCache(key);
}

export async function putCachedTranscript(key: string, result: TranscribeResult): Promise<void> {
  try {
    const database = await openDatabase();
    if (database) {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readwrite");
        transaction.objectStore(STORE_NAME).put({ key, createdAt: Date.now(), result } satisfies CacheRecord);
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
        transaction.onerror = () => reject(transaction.error);
      });
    }
  } catch {
    // Continue to disk cache
  }

  writeDiskCache(key, result);
}
