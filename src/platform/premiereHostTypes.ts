import type { SubtitleCue } from "../core/subtitles/srtParser";

export type AudioSourceKind = "sequence" | "track" | "range";

export type AudioSourceRequest =
  | { kind: "sequence"; sequenceId: string }
  | {
      kind: "track";
      sequenceId: string;
      trackIndex: number;
    }
  | {
      kind: "range";
      sequenceId: string;
      startSec: number;
      endSec: number;
      trackIndex?: number;
    };

export interface PreparedTimelineAudio {
  jobId: string;
  sequenceId: string;
  audioPath: string;
  durationSec: number;
  timelineStartSec: number;
  temporary: boolean;
}

export interface TimelineCaptionDocument {
  sequenceId: string;
  timelineStartSec: number;
  audioDurationSec: number;
  cues: SubtitleCue[]; // Times remain relative to exported audio (0 <= t <= audioDurationSec).
}

export interface CaptionImportResult {
  status: "track-created" | "bin-only" | "failed";
  filePath?: string;
  message: string;
  code?: string;
  projectItemName?: string;
}

export interface SequenceSnapshot {
  sequenceId: string;
  audioTrackMutes: boolean[];
  inPointSec: number | null;
  outPointSec: number | null;
}

export interface HostAudioTrackSummary {
  index: number;
  name: string;
  isMuted: boolean;
  clipCount: number;
}

export interface HostSequenceSummary {
  sequenceId: string;
  sequenceName: string;
  durationSec: number;
  zeroPointSec: number;
  inPointSec: number | null;
  outPointSec: number | null;
  selectedRange: {
    startSec: number;
    endSec: number;
  } | null;
  audioTracks: HostAudioTrackSummary[];
}

export interface MOGRTInsertionRequest {
  sequenceId: string;
  templatePath: string;
  text: string;
  encoding: "unicode" | "wije" | "isi";
  targetVideoTrackIndex: number;
  durationSec: number;
  playheadTimeSec?: number;
}

export interface MOGRTInsertionResult {
  success: boolean;
  message: string;
  code?: string;
  trackItemName?: string;
  appliedText?: string;
}

export interface HostRpcResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

