import type { SubtitleCue } from "../subtitles/srtParser";

/**
 * Section 7: SSE Event Model Contract
 * Defines the standard Server-Sent Events protocol for progressive transcription.
 */

export interface JobCreatedEvent {
  type: "job_created";
  jobId: string;
  totalDuration: number;
  estimatedChunks: number;
}

export interface ChunkStartedEvent {
  type: "chunk_started";
  jobId: string;
  chunkIndex: number;
  start: number;
  end: number;
}

export interface CueEvent {
  type: "cue";
  jobId: string;
  cue: SubtitleCue;
  chunkIndex?: number;
}

export interface ChunkCompletedEvent {
  type: "chunk_completed";
  jobId: string;
  chunkIndex: number;
  cuesCount: number;
}

export interface JobCompletedEvent {
  type: "job_completed";
  jobId: string;
  totalCues: number;
  duration: number;
  cached: boolean;
  cues: SubtitleCue[];
}

export interface ProgressEvent {
  type: "progress";
  jobId: string;
  percent: number;
  message: string;
}

export interface ErrorEvent {
  type: "error";
  jobId: string;
  code: string;
  message: string;
  retryable: boolean;
}

export type AutoCapSseEvent =
  | JobCreatedEvent
  | ChunkStartedEvent
  | CueEvent
  | ChunkCompletedEvent
  | JobCompletedEvent
  | ProgressEvent
  | ErrorEvent;

/**
 * Formats a typed AutoCap event into SSE wire protocol format.
 */
export function formatSseMessage(event: AutoCapSseEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

/**
 * Parses raw SSE data string into a typed AutoCapSseEvent.
 */
export function parseSseData(dataString: string): AutoCapSseEvent | null {
  try {
    return JSON.parse(dataString) as AutoCapSseEvent;
  } catch {
    return null;
  }
}

