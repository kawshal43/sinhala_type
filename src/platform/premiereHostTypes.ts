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
  style?: GraphicStyleOptions;
}

export type GraphicInsertionMode = "add" | "replace" | "timing-only";

export interface GraphicStyleOptions {
  fontFamily?: string;
  fontSize?: number;
  fillColor?: string;
  positionX?: number;
  positionY?: number;
  alignment?: "left" | "center" | "right";
  strokeWidth?: number;
  shadowEnabled?: boolean;
  backgroundEnabled?: boolean;
  animation?: "none" | "fade" | "pop" | "slide-up";
  animationDuration?: number;
}

export interface CaptionGraphicsRequest {
  sequenceId: string;
  timelineStartSec: number;
  templatePath?: string;
  encoding?: "unicode" | "wije" | "isi";
  targetVideoTrackIndex: number;
  cues: SubtitleCue[];
  style?: GraphicStyleOptions;
  mode?: GraphicInsertionMode;
}

export interface GraphicBatchRequest {
  sequenceId: string;
  timelineStartSec: number;
  templatePath?: string;
  targetVideoTrackIndex: number;
  batchStartIndex: number;
  totalCues: number;
  cues: SubtitleCue[];
  style?: GraphicStyleOptions;
  mode?: GraphicInsertionMode;
}

export interface GraphicBatchResult {
  success: boolean;
  mode?: GraphicInsertionMode;
  batchInserted?: number;
  batchStartIndex?: number;
  appliedProperties?: string[];
  missingProperties?: string[];
  message?: string;
  code?: string;
}

export interface ChunkedGraphicsProgress {
  inserted: number;
  total: number;
  percentage: number;
  currentBatch: number;
  totalBatches: number;
  statusText: string;
}

export interface ChunkedGraphicsOptions {
  batchSize?: number;
  onProgress?: (progress: ChunkedGraphicsProgress) => void;
  signal?: AbortSignal;
}

export interface MOGRTInsertionResult {
  success: boolean;
  message: string;
  code?: string;
  trackItemName?: string;
  appliedText?: string;
  insertedCount?: number;
  requestedCount?: number;
  appliedProperties?: string[];
  missingProperties?: string[];
}

export interface UpgradeCaptionsResult {
  status: "upgraded";
  commandId: number;
  commandName: string;
  message: string;
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

