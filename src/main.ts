import { checkLocalWorkerHealth, canProcessTranscription } from "./services/localWorkerClient";
import "./styles.css";
import { unicodeToDlManel } from "sinhala-unicode-coverter";
import { PHONETIC_CATEGORIES, WIJESEKARA_ROWS, type PhoneticCategory } from "./core/keyboardLayouts";
import { unicodeToIsi } from "./core/isiConverter";
import { transliterate } from "./core/transliterator";
import { copyText, copyToHostClipboard, readFromHostClipboard } from "./platform/clipboard";
import { applySelectionEdit, deleteAtSelection, insertAtSelection } from "./ui/textInsertion";

// Subtitle & Auto Caption imports
import { formatDisplayDuration, formatSrtTime, parseTimestamp } from "./core/subtitles/timeUtils";
import {
  generateSrt,
  generateVtt,
  parseSrt,
  parseVtt,
  type SubtitleCue
} from "./core/subtitles/srtParser";
import {
  optimizeAllCues,
  reindexCues,
  shiftCues
} from "./core/subtitles/captionOptimizer";
import {
  convertCaptionText,
  convertSubtitleCues,
  getSinhalaFontTestSamples,
  isSinhalaText,
  type CaptionEncoding
} from "./core/subtitles/captionConverter";
import {
  auditSubtitleVerification,
  type VerificationAuditReport
} from "./core/subtitles/captionVerifier";
import {
  recheckAndFillGaps,
  VerificationController
} from "./services/verificationEngine";
import { repairTimestampOverlaps } from "./core/subtitles/timelineMerger";
import { createTimelineCaptionDocument } from "./core/subtitles/timelineContext";
import { retranscribeCue, type TranscribeResult } from "./services/sttService";
import { transcribeAudioChunked } from "./services/chunkedTranscription";
import { AudioRecorder } from "./services/audioRecorder";
import {
  clearAudioDecodeCache,
  evalExtendScript,
  loadMediaFileFromPath,
  prepareMediaForTranscription,
  exportSubtitleFile,
  getSequenceAudioTracks,
  sliceAudioBlob,
  type SequenceAudioTrackInfo,
  type SequenceClipInfo
} from "./platform/premiereBridge";
import { transcriptionJobController } from "./services/transcriptionJob";
import { audioPresetManager } from "./services/audioPresetManager";
import { runGeminiAudioDiagnostic } from "./services/geminiDiagnostics";
import { premiereAudioClient } from "./platform/premiereAudio";
import { premiereGraphicsClient } from "./platform/premiereGraphics";
import { premiereCaptionsClient } from "./platform/premiereCaptions";
import { temporaryMedia } from "./services/temporaryMedia";
import type { PreparedTimelineAudio, TimelineCaptionDocument, HostSequenceSummary, AudioSourceRequest } from "./platform/premiereHostTypes";
import {
  loadSettings,
  saveSettings,
  type AppSettings,
  type LanguageChoice,
  type SttProvider
} from "./storage/appSettings";

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;

/* ==========================================================================
   Global State
   ========================================================================== */
let appSettings: AppSettings = loadSettings();
let currentAudioFile: File | Blob | null = null;
let currentMediaPath: string | null = null;
let preparedTimelineAudio: PreparedTimelineAudio | null = null;
let timelineDocument: TimelineCaptionDocument | null = null;
let loadedTimelineContext: Omit<TimelineCaptionDocument, "cues"> | null = null;
let mediaRevision = 0;
async function inspectTimeline(): Promise<HostSequenceSummary> {
  const result = JSON.parse(await evalExtendScript("$._AutoCap_Host.inspectActiveSequence();") || "{}");
  if (!result.success || !result.data) throw new Error(result.error?.message || "Open an active Premiere sequence.");
  return result.data;
}

let currentCues: SubtitleCue[] = [];
let subtitleEncoding: CaptionEncoding = "unicode";
let detectedIsSinhala = false;
let sequenceTracks: SequenceAudioTrackInfo[] = [];
let timelineSelectedClips: SequenceClipInfo[] = [];
const audioRecorder = new AudioRecorder();
let activeVerificationController: VerificationController | null = null;

// Undo / Redo History
let cueHistory: SubtitleCue[][] = [];
let cueRedoStack: SubtitleCue[][] = [];

function pushCueHistory(): void {
  cueHistory.push(JSON.parse(JSON.stringify(currentCues)));
  if (cueHistory.length > 40) cueHistory.shift();
  cueRedoStack = [];
  updateUndoRedoButtons();
}

function updateUndoRedoButtons(): void {
  btnUndoCue.disabled = cueHistory.length === 0;
  btnRedoCue.disabled = cueRedoStack.length === 0;
}

function undo(): void {
  if (cueHistory.length === 0) return;
  cueRedoStack.push(JSON.parse(JSON.stringify(currentCues)));
  currentCues = cueHistory.pop()!;
  renderCuesList();
  updateUndoRedoButtons();
  notify("Undid last edit");
}

function redo(): void {
  if (cueRedoStack.length === 0) return;
  cueHistory.push(JSON.parse(JSON.stringify(currentCues)));
  currentCues = cueRedoStack.pop()!;
  renderCuesList();
  updateUndoRedoButtons();
  notify("Redid edit");
}

// Global Notification
const messageEl = document.querySelector<HTMLElement>("#message");
let notifyTimer: any = null;

function notify(text: string, error = false): void {
  if (!messageEl) return;
  messageEl.textContent = text;
  messageEl.classList.remove("error", "success");
  messageEl.classList.add(error ? "error" : "success");
  messageEl.classList.add("active");

  if (notifyTimer) clearTimeout(notifyTimer);
  notifyTimer = window.setTimeout(() => {
    messageEl.classList.remove("active");
  }, 4000);
}

// Global runtime error safety
window.addEventListener("error", (event) => {
  console.error("AutoCap Runtime Error:", event.error || event.message);
  notify(`System Error: ${event.message || "Unknown error"}`, true);
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("AutoCap Unhandled Promise:", event.reason);
  notify(`Async Error: ${event.reason?.message || event.reason || "Unhandled error"}`, true);
});

/* ==========================================================================
   Navigation Tabs
   ========================================================================== */
type TabName = "caption" | "typer" | "settings";

const tabButtons: Record<TabName, HTMLButtonElement> = {
  caption: $("#tab-btn-caption") as HTMLButtonElement,
  typer: $("#tab-btn-typer") as HTMLButtonElement,
  settings: $("#tab-btn-settings") as HTMLButtonElement
};

const tabViews: Record<TabName, HTMLElement> = {
  caption: $("#view-caption"),
  typer: $("#view-typer"),
  settings: $("#view-settings")
};

function switchTab(target: TabName): void {
  for (const name of ["caption", "typer", "settings"] as TabName[]) {
    const isTarget = name === target;
    tabButtons[name].classList.toggle("active", isTarget);
    tabButtons[name].setAttribute("aria-selected", String(isTarget));
    tabViews[name].hidden = !isTarget;
  }
}

tabButtons.caption.addEventListener("click", () => switchTab("caption"));
tabButtons.typer.addEventListener("click", () => switchTab("typer"));
tabButtons.settings.addEventListener("click", () => switchTab("settings"));

/* ==========================================================================
   TAB 1: Auto Caption
   ========================================================================== */
// Track selection
const selectAudioTrack = $("#select-audio-track") as HTMLSelectElement;
const selectAudioClip = $("#select-audio-clip") as HTMLSelectElement;
const clipSelectorRow = $("#clip-selector-row");
const btnRefreshTracks = $("#btn-refresh-tracks") as HTMLButtonElement;
const btnLoadTrack = $("#btn-load-track") as HTMLButtonElement;
const btnGenerateSelection = $("#btn-generate-selection") as HTMLButtonElement;
const btnRemoveTrack = $("#btn-remove-track") as HTMLButtonElement;
const btnClearAudio = $("#btn-clear-audio") as HTMLButtonElement;
const trackLoadStatus = $("#track-load-status");
const trackLoadText = $("#track-load-text");
const trackLoadPercent = $("#track-load-percent");
const trackProgressBar = $("#track-progress-bar");

function setTrackProgress(percent: number, text?: string): void {
  trackLoadStatus.hidden = false;
  if (text) trackLoadText.textContent = text;
  trackLoadPercent.textContent = `${percent}%`;
  trackProgressBar.style.width = `${percent}%`;
}

function hideTrackProgress(): void {
  trackLoadStatus.hidden = true;
  trackProgressBar.style.width = "0%";
}

// File drop & record
const dropzone = $("#dropzone");
const audioFileInput = $("#audio-file-input") as HTMLInputElement;
const btnBrowseFile = $("#btn-browse-file") as HTMLButtonElement;
const btnRecordMic = $("#btn-record-mic") as HTMLButtonElement;
const recordIcon = $("#record-icon");
const recordText = $("#record-text");
const audioPreviewCard = $("#audio-preview-card");
const audioPlayer = $("#audio-player") as HTMLAudioElement;
const audioFilename = $("#audio-filename");
const audioDuration = $("#audio-duration");

// Transcribe options
const selectLanguage = $("#select-language") as HTMLSelectElement;
const selectProvider = $("#select-provider") as HTMLSelectElement;
const btnTranscribe = $("#btn-transcribe") as HTMLButtonElement;
const captionStatus = $("#caption-status");
const captionStatusText = $("#caption-status-text");
const captionStatusPercent = $("#caption-status-percent");
const captionProgressBar = $("#caption-progress-bar");
const btnPauseTranscribe = $("#btn-pause-transcribe") as HTMLButtonElement;
const pauseIcon = $("#pause-icon") as HTMLElement;
const pauseLabel = $("#pause-label") as HTMLElement;
const btnStopTranscribe = $("#btn-stop-transcribe") as HTMLButtonElement;

function setCaptionProgress(percent: number, text?: string): void {
  captionStatus.hidden = false;
  if (text) captionStatusText.textContent = text;
  captionStatusPercent.textContent = `${percent}%`;
  captionProgressBar.style.width = `${percent}%`;
}

function hideCaptionProgress(): void {
  captionStatus.hidden = true;
  captionProgressBar.style.width = "0%";
}

// Subtitles editor
const subtitlesSection = $("#subtitles-section");
const cuesCountEl = $("#cues-count");
const verificationBadge = $("#verification-status-badge") as HTMLElement;
const detectedLangPill = $("#detected-lang-pill");
const sinhalaTestBox = $("#sinhala-test-box");
const sinhalaTestChips = $("#sinhala-test-chips");
const cueListEl = $("#cue-list");

const subModeUnicode = $("#sub-mode-unicode") as HTMLButtonElement;
const subModeWije = $("#sub-mode-wije") as HTMLButtonElement;
const subModeIsi = $("#sub-mode-isi") as HTMLButtonElement;

const btnImportPremiere = $("#btn-import-premiere") as HTMLButtonElement;
const btnExportSrt = $("#btn-export-srt") as HTMLButtonElement;
const btnExportVtt = $("#btn-export-vtt") as HTMLButtonElement;
const btnCopySrt = $("#btn-copy-srt") as HTMLButtonElement;

const btnUndoCue = $("#btn-undo-cue") as HTMLButtonElement;
const btnRedoCue = $("#btn-redo-cue") as HTMLButtonElement;
const btnAddCue = $("#btn-add-cue") as HTMLButtonElement;
const btnToggleSearch = $("#btn-toggle-search") as HTMLButtonElement;
const btnRepairTiming = $("#btn-repair-timing") as HTMLButtonElement;
const btnRecheckCues = $("#btn-recheck-cues") as HTMLButtonElement;
const btnShiftBack = $("#btn-shift-back") as HTMLButtonElement;
const btnShiftForward = $("#btn-shift-forward") as HTMLButtonElement;
const btnAutoCpl = $("#btn-auto-cpl") as HTMLButtonElement;

const searchReplacePanel = $("#search-replace-panel");
const searchFindInput = $("#search-find-input") as HTMLInputElement;
const searchReplaceInput = $("#search-replace-input") as HTMLInputElement;
const btnExecReplace = $("#btn-exec-replace") as HTMLButtonElement;
const btnCloseSearch = $("#btn-close-search") as HTMLButtonElement;

function updateVerificationBadge(audit: VerificationAuditReport): void {
  verificationBadge.hidden = false;
  verificationBadge.classList.remove("verifying");
  verificationBadge.classList.toggle("warning", !audit.isFullyVerified);
  verificationBadge.classList.toggle("success", audit.isFullyVerified);
  verificationBadge.textContent = audit.isFullyVerified
    ? `✓ 100% Verified (${audit.totalCues})`
    : `✓ Checked (${audit.totalCues})`;
  verificationBadge.title = audit.summary;
}

btnPauseTranscribe.addEventListener("click", () => {
  if (!activeVerificationController) return;
  const isPaused = activeVerificationController.togglePause();
  btnPauseTranscribe.classList.toggle("paused", isPaused);
  pauseIcon.innerHTML = isPaused ? "&#x25B6;" : "&#x23F8;";
  pauseLabel.textContent = isPaused ? "Resume" : "Pause";
  notify(isPaused ? "Paused caption processing." : "Resumed caption processing.");
});

btnStopTranscribe.addEventListener("click", () => {
  transcriptionJobController.cancelActiveJob();
  if (!activeVerificationController) return;
  activeVerificationController.stop();
  setCaptionProgress(100, "Stopping process and preserving captions...");
  notify("Stopped process. Preserving generated captions.");
});

function loadAudioFile(file: File | Blob, name = "Audio Recording", mediaPath?: string): void {
  mediaRevision++;
  activeVerificationController?.stop();
  transcriptionJobController.cancelActiveJob();
  preparedTimelineAudio = null;
  timelineDocument = null;
  loadedTimelineContext = null;
  currentAudioFile = file;
  currentMediaPath = mediaPath || (file as any).path || null;
  const objectUrl = URL.createObjectURL(file);
  audioPlayer.src = objectUrl;
  audioFilename.textContent = name;
  audioPreviewCard.hidden = false;
  btnRemoveTrack.hidden = false;

  audioPlayer.onloadedmetadata = () => {
    audioDuration.textContent = formatDisplayDuration(audioPlayer.duration);
  };
  $("#dropzone-label").textContent = `Loaded: ${name}`;
}

function unloadAudio(): void {
  mediaRevision++;
  activeVerificationController?.stop();
  transcriptionJobController.cancelActiveJob();
  preparedTimelineAudio = null;
  timelineDocument = null;
  loadedTimelineContext = null;
  currentAudioFile = null;
  currentMediaPath = null;
  audioPlayer.pause();
  audioPlayer.src = "";
  audioPreviewCard.hidden = true;
  btnRemoveTrack.hidden = true;
  $("#dropzone-label").textContent = "Drop audio/video file here";
  audioFileInput.value = "";
  clearAudioDecodeCache();
  notify("Audio removed/unloaded.");
}

btnRemoveTrack.addEventListener("click", unloadAudio);
btnClearAudio.addEventListener("click", unloadAudio);

function updateClipSelector(): void {
  // Export uses the whole track or the live selection span, including all cuts.
  selectAudioClip.innerHTML = "";
  clipSelectorRow.hidden = true;
}

selectAudioTrack.addEventListener("change", updateClipSelector);

// Scan & Load Premiere Pro Sequence Audio Tracks
async function scanPremiereTracks(): Promise<void> {
  notify("Scanning sequence audio tracks in Premiere Pro...");
  try {
    const seqInfo = await getSequenceAudioTracks();
    if (seqInfo.error) {
      selectAudioTrack.innerHTML = `<option value="">(${seqInfo.error})</option>`;
      notify(seqInfo.error, true);
      return;
    }

    sequenceTracks = seqInfo.tracks || [];
    timelineSelectedClips = seqInfo.selectedClips || [];
    selectAudioTrack.innerHTML = "";

    if (sequenceTracks.length === 0) {
      selectAudioTrack.innerHTML = `<option value="">(No audio tracks in active sequence)</option>`;
      notify("No audio tracks found in sequence.");
      clipSelectorRow.hidden = true;
      return;
    }

    sequenceTracks.forEach((track) => {
      const opt = document.createElement("option");
      opt.value = String(track.index);
      const clipText = track.clipCount === 1 ? "1 clip" : `${track.clipCount} clips`;
      const mediaName = track.clips[0]?.name ? ` · ${track.clips[0].name}` : "";
      opt.textContent = `Track A${track.index + 1}: ${track.name} (${clipText}${mediaName})`;
      selectAudioTrack.appendChild(opt);
    });
    if (sequenceTracks.length > 0) selectAudioTrack.value = String(sequenceTracks[0].index);

    updateClipSelector();
    notify(`Found ${sequenceTracks.length} audio tracks in "${seqInfo.sequenceName || "Sequence"}"`);
  } catch (err: any) {
    notify(`Failed to scan tracks: ${err.message}`, true);
  }
}

btnRefreshTracks.addEventListener("click", scanPremiereTracks);

async function loadPremiereAudio(kind = activeSourceKind): Promise<boolean> {
  if (transcriptionJobController.isBusy() || btnTranscribe.disabled) {
    notify("Stop the current transcription before loading audio.", true);
    return false;
  }
  btnLoadTrack.disabled = true;
  const revision = mediaRevision;
  const jobId = `load_${Date.now()}`;
  try {
    if (kind === "range") {
      const liveInfo = await getSequenceAudioTracks();
      if (liveInfo.error) throw new Error(liveInfo.error);
      timelineSelectedClips = liveInfo.selectedClips || [];
    }
    const sequence = await inspectTimeline();
    let request: AudioSourceRequest;
    if (kind === "range") {
      if (!sequence.selectedRange) throw new Error("Select clips on the timeline first.");

      const directClip = timelineSelectedClips.length === 1 ? timelineSelectedClips[0] : null;
      if (directClip?.mediaPath && directClip.duration > 0) {
        try {
          setTrackProgress(15, "Extracting selected clip audio...");
          const direct = await prepareMediaForTranscription(
            directClip.mediaPath,
            directClip.inPoint || 0,
            directClip.duration,
            (percent, message) => setTrackProgress(percent, message),
            true
          );
          if (revision !== mediaRevision) return false;
          loadAudioFile(direct.blob, direct.filename);
          loadedTimelineContext = {
            sequenceId: sequence.sequenceId,
            timelineStartSec: directClip.startTime ?? sequence.selectedRange.startSec,
            audioDurationSec: directClip.duration
          };
          notify("Selected clip audio loaded directly. No export preset was needed.");
          return true;
        } catch (directError) {
          console.warn("Direct selected-clip extraction failed; using Premiere render:", directError);
          setTrackProgress(20, "Rendering selected range through Premiere...");
        }
      }
      request = { kind: "range", sequenceId: sequence.sequenceId, ...sequence.selectedRange };
    } else if (kind === "sequence") {
      request = { kind: "sequence", sequenceId: sequence.sequenceId };
    } else {
      const trackIndex = Number(selectAudioTrack.value);
      if (!selectAudioTrack.value || !Number.isInteger(trackIndex)) throw new Error("Select an audio track first.");
      request = { kind: "track", sequenceId: sequence.sequenceId, trackIndex };
    }
    setTrackProgress(10, "Exporting Premiere timeline audio...");
    const prepared = await premiereAudioClient.exportTimelineAudio(request, jobId);
    const media = await loadMediaFileFromPath(prepared.audioPath);
    if (revision !== mediaRevision) { temporaryMedia.cleanupJobAudio(jobId); return false; }
    loadAudioFile(media.blob, "Timeline audio", prepared.audioPath);
    preparedTimelineAudio = prepared;
    loadedTimelineContext = {
      sequenceId: prepared.sequenceId,
      timelineStartSec: prepared.timelineStartSec,
      audioDurationSec: prepared.durationSec
    };
    temporaryMedia.releasePreviousDocuments(jobId);
    notify("Timeline audio loaded. Generate captions to transcribe it.");
    return true;
  } catch (error: any) {
    temporaryMedia.cleanupJobAudio(jobId);
    notify(error.message || "Timeline export failed.", true);
    return false;
  } finally {
    btnLoadTrack.disabled = false;
    hideTrackProgress();
  }
}

btnLoadTrack.addEventListener("click", () => { void loadPremiereAudio(); });

btnGenerateSelection.addEventListener("click", async () => {
  setAudioSourceKind("range");
  btnGenerateSelection.disabled = true;
  try {
    if (await loadPremiereAudio("range")) btnTranscribe.click();
  } finally {
    btnGenerateSelection.disabled = false;
  }
});

// Dropzone & File Selection
dropzone.addEventListener("click", () => audioFileInput.click());
btnBrowseFile.addEventListener("click", () => audioFileInput.click());

dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropzone.classList.add("dragover");
});

dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));

dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("dragover");
  const file = e.dataTransfer?.files[0];
  if (file) handleFileSelected(file);
});

audioFileInput.addEventListener("change", () => {
  const file = audioFileInput.files?.[0];
  if (file) handleFileSelected(file);
});

async function handleFileSelected(file: File): Promise<void> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".srt") || name.endsWith(".vtt")) {
    const text = await file.text();
    const cues = name.endsWith(".vtt") ? parseVtt(text) : parseSrt(text);
    if (cues.length > 0) {
      pushCueHistory();
      mediaRevision++;
      activeVerificationController?.stop();
      transcriptionJobController.cancelActiveJob();
      timelineDocument = null;
      currentCues = cues;
      detectedIsSinhala = isSinhalaText(cues.map((c) => c.text).join(" "));
      updateSinhalaUiState();
      renderCuesList();
      subtitlesSection.hidden = false;
      notify(`Loaded ${cues.length} subtitles from ${file.name}`);
      return;
    }
  }

  loadAudioFile(file, file.name);
}

// Microphone Recording
btnRecordMic.addEventListener("click", async () => {
  if (!audioRecorder.active) {
    try {
      await audioRecorder.start({
        onTimeUpdate: (secs) => {
          recordText.textContent = `Recording (${formatDisplayDuration(secs)})`;
        },
        onError: (err) => {
          notify(`Microphone Error: ${err.message}`, true);
          btnRecordMic.classList.remove("recording");
          recordText.textContent = "Record Mic";
        }
      });
      btnRecordMic.classList.add("recording");
      recordIcon.textContent = "⏹️";
      recordText.textContent = "Recording (00:00)";
      notify("Recording microphone audio...");
    } catch {
      notify("Unable to access microphone.", true);
    }
  } else {
    try {
      const audioBlob = await audioRecorder.stop();
      btnRecordMic.classList.remove("recording");
      recordIcon.textContent = "🔴";
      recordText.textContent = "Record Mic";
      loadAudioFile(audioBlob, `Voice_${new Date().toLocaleTimeString().replace(/:/g, "-")}.webm`);
      notify("Recording finished. Ready to generate captions!");
    } catch (err: any) {
      notify(err.message, true);
    }
  }
});

// Sinhala UI state & Font Test updates
function updateSinhalaUiState(): void {
  detectedLangPill.hidden = false;
  detectedLangPill.textContent = detectedIsSinhala ? "✨ Sinhala Detected" : "English Detected";
  detectedLangPill.classList.toggle("sinhala", detectedIsSinhala);

  sinhalaTestBox.hidden = !detectedIsSinhala;
  if (detectedIsSinhala) {
    renderSinhalaFontTests();
  }
}

function renderSinhalaFontTests(): void {
  sinhalaTestChips.innerHTML = "";
  const samples = getSinhalaFontTestSamples(subtitleEncoding);

  samples.forEach((sample) => {
    const chip = document.createElement("div");
    chip.className = "test-chip";
    if (subtitleEncoding === "wije") chip.classList.add("font-wije");
    else if (subtitleEncoding === "isi") chip.classList.add("font-isi");
    chip.innerHTML = `<span>${sample.label}:</span> <strong>${sample.display}</strong>`;
    chip.title = `Click to copy "${sample.display}"`;
    chip.addEventListener("click", async () => {
      if (!copyToHostClipboard(sample.display)) {
        await navigator.clipboard.writeText(sample.display);
      }
      notify(`Copied sample "${sample.display}" to clipboard!`);
    });
    sinhalaTestChips.appendChild(chip);
  });
}

btnTranscribe.addEventListener("click", async () => {
  if (!currentAudioFile) {
    const trackBox = document.querySelector(".premiere-track-box");
    trackBox?.classList.add("pulse-highlight");
    window.setTimeout(() => trackBox?.classList.remove("pulse-highlight"), 2500);
    return notify("⚠️ No audio loaded! Select an audio track above and click 'Load Selected Audio'.", true);
  }

  // Sync any key typed in Settings tab
  if (inputGeminiKey.value.trim() && inputGeminiKey.value.trim() !== appSettings.geminiApiKey) {
    appSettings.geminiApiKey = inputGeminiKey.value.trim();
    saveSettings(appSettings);
  }
  if (inputGroqKey.value.trim() && inputGroqKey.value.trim() !== appSettings.groqApiKey) {
    appSettings.groqApiKey = inputGroqKey.value.trim();
    saveSettings(appSettings);
  }
  if (inputOpenaiKey.value.trim() && inputOpenaiKey.value.trim() !== appSettings.openaiApiKey) {
    appSettings.openaiApiKey = inputOpenaiKey.value.trim();
    saveSettings(appSettings);
  }

  appSettings.language = selectLanguage.value as LanguageChoice;
  appSettings.sttProvider = selectProvider.value as SttProvider;

  // Verify provider credentials
  if (appSettings.sttProvider === "gemini" && !appSettings.geminiApiKey) {
    switchTab("settings");
    inputGeminiKey.focus();
    return notify("Please enter your Google Gemini API Key in Settings.", true);
  }
  if (appSettings.sttProvider === "groq" && !appSettings.groqApiKey) {
    switchTab("settings");
    inputGroqKey.focus();
    return notify("Please enter your Groq API Key in Settings.", true);
  }
  if (appSettings.sttProvider === "openai" && !appSettings.openaiApiKey) {
    switchTab("settings");
    inputOpenaiKey.focus();
    return notify("Please enter your OpenAI API Key in Settings.", true);
  }

  pushCueHistory();
  currentCues = [];
  cueListEl.innerHTML = "";
  cuesCountEl.textContent = "0 captions";

  activeVerificationController = new VerificationController();
  btnPauseTranscribe.classList.remove("paused");
  pauseIcon.innerHTML = "&#x23F8;";
  pauseLabel.textContent = "Pause";
  btnPauseTranscribe.disabled = false;
  btnStopTranscribe.disabled = false;

  setCaptionProgress(10, "Connecting to AI Engine...");
  btnTranscribe.disabled = true;

  try {
    let result: TranscribeResult;
    const revision = mediaRevision;
    const signal = activeVerificationController.signal;
    const onCue = (cue: SubtitleCue) => {
      if (signal.aborted || revision !== mediaRevision) return;
      currentCues.push(cue);
      appendSingleCueCard(cue, currentCues.length - 1);
    };
    if (preparedTimelineAudio) {
      const prepared = preparedTimelineAudio;
      const document = await transcriptionJobController.executeJob(
        { kind: "range", sequenceId: prepared.sequenceId, startSec: prepared.timelineStartSec,
          endSec: prepared.timelineStartSec + prepared.durationSec },
        { ...appSettings }, async () => prepared,
        { onCue, onProgress: p => { if (!signal.aborted && revision === mediaRevision) setCaptionProgress(p.percent, p.message); } }
      );
      if (signal.aborted || revision !== mediaRevision) return;
      timelineDocument = document;
      result = { cues: document.cues, providerUsed: appSettings.sttProvider,
        isSinhala: isSinhalaText(document.cues.map(c => c.text).join(" ")) };
    } else {
      result = await transcribeAudioChunked({
        file: currentAudioFile, settings: { ...appSettings }, signal, onCue,
        onProgress: p => { if (!signal.aborted && revision === mediaRevision) setCaptionProgress(p.percent ?? 50, p.message); }
      });
    }
    if (signal.aborted || revision !== mediaRevision) return;

    if (result.cues.length === 0 && currentCues.length === 0) {
      notify("No speech detected in audio.", true);
      return;
    }

    const baseCues = result.cues.length > 0 ? result.cues : currentCues;
    currentCues = baseCues;

    setCaptionProgress(92, "Optimizing line lengths & timestamps...");
    currentCues = optimizeAllCues(currentCues, appSettings.maxCpl || 38);
    if (loadedTimelineContext) {
      timelineDocument = createTimelineCaptionDocument(
        loadedTimelineContext.sequenceId,
        loadedTimelineContext.timelineStartSec,
        loadedTimelineContext.audioDurationSec,
        currentCues
      );
    }
    detectedIsSinhala = result.isSinhala || isSinhalaText(currentCues.map((c) => c.text).join(" "));
    updateSinhalaUiState();

    subtitlesSection.hidden = false;
    renderCuesList();
    setCaptionProgress(100, `Generated ${currentCues.length} captions!`);
    notify(`Generated ${currentCues.length} captions using ${result.providerUsed}!`);
    if (appSettings.autoImportCaptions) {
      await importCurrentCaptions();
    }
  } catch (err: any) {
    notify(err.message || "Transcription failed.", true);
  } finally {
    btnTranscribe.disabled = false;
    btnPauseTranscribe.disabled = true;
    btnStopTranscribe.disabled = true;
    activeVerificationController = null;
    window.setTimeout(() => hideCaptionProgress(), 1800);
  }
});

// Subtitle Font Switcher
function setSubtitleEncoding(mode: CaptionEncoding): void {
  subtitleEncoding = mode;
  subModeUnicode.classList.toggle("active", mode === "unicode");
  subModeWije.classList.toggle("active", mode === "wije");
  subModeIsi.classList.toggle("active", mode === "isi");

  if (detectedIsSinhala) {
    renderSinhalaFontTests();
  }
  renderCuesList();
}

subModeUnicode.addEventListener("click", () => setSubtitleEncoding("unicode"));
subModeWije.addEventListener("click", () => setSubtitleEncoding("wije"));
subModeIsi.addEventListener("click", () => setSubtitleEncoding("isi"));

// Copy single cue text helper with card feedback
async function copySingleCue(cue: SubtitleCue, card: HTMLElement, idx: number): Promise<void> {
  const convertedText = convertCaptionText(cue.text, subtitleEncoding);
  if (!convertedText) return;

  try {
    const copied = await copyText(convertedText);
    if (copied) {
      card.classList.add("copied");
      const badge = card.querySelector(".cue-copy-badge") as HTMLElement;
      if (badge) badge.textContent = "✓ Copied!";

      setTimeout(() => {
        card.classList.remove("copied");
        if (badge) badge.textContent = "";
      }, 1600);

      notify(`Copied Line #${idx + 1} to clipboard!`);
    } else {
      notify("Unable to copy to clipboard.", true);
    }
  } catch {
    notify("Unable to copy to clipboard.", true);
  }
}

// Build individual Cue Card Element
function buildCueCard(cue: SubtitleCue, idx: number): HTMLElement {
  const card = document.createElement("div");
  card.className = "cue-card";
  card.setAttribute("tabindex", "0");
  card.setAttribute("role", "article");
  card.title = "Click anywhere on this card to copy text";

  const header = document.createElement("div");
  header.className = "cue-header";

  const idxBadge = document.createElement("span");
  idxBadge.className = "cue-idx";
  idxBadge.textContent = `#${idx + 1}`;

  const copyBadge = document.createElement("span");
  copyBadge.className = "cue-copy-badge";

  const startInput = document.createElement("input");
  startInput.type = "text";
  startInput.className = "cue-time-input";
  startInput.value = formatSrtTime(cue.start);
  startInput.title = "Start time (HH:MM:SS,mmm)";
  startInput.addEventListener("click", (e) => e.stopPropagation());
  startInput.addEventListener("change", () => {
    pushCueHistory();
    cue.start = parseTimestamp(startInput.value);
    if (cue.end < cue.start) cue.end = cue.start + 1.5;
    renderCuesList();
  });

  const arrowSpan = document.createElement("span");
  arrowSpan.textContent = "➔";

  const endInput = document.createElement("input");
  endInput.type = "text";
  endInput.className = "cue-time-input";
  endInput.value = formatSrtTime(cue.end);
  endInput.title = "End time (HH:MM:SS,mmm)";
  endInput.addEventListener("click", (e) => e.stopPropagation());
  endInput.addEventListener("change", () => {
    pushCueHistory();
    cue.end = Math.max(cue.start + 0.2, parseTimestamp(endInput.value));
    renderCuesList();
  });

  const actionsRight = document.createElement("div");
  actionsRight.className = "cue-actions-right";

  // Play Cue Audio
  const playBtn = document.createElement("button");
  playBtn.type = "button";
  playBtn.className = "cue-icon-btn";
  playBtn.innerHTML = "&#x25B6;";
  playBtn.title = "Play this subtitle segment";
  playBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (audioPlayer.src) {
      audioPlayer.currentTime = cue.start;
      audioPlayer.play();
      const checkStop = () => {
        if (audioPlayer.currentTime >= cue.end) {
          audioPlayer.pause();
          audioPlayer.removeEventListener("timeupdate", checkStop);
        }
      };
      audioPlayer.addEventListener("timeupdate", checkStop);
    }
  });

  // Retry / Re-transcribe Cue with AI
  const retryBtn = document.createElement("button");
  retryBtn.type = "button";
  retryBtn.className = "cue-icon-btn retry-btn";
  retryBtn.innerHTML = "&#x21BB;";
  retryBtn.title = "Retry / re-transcribe this caption segment with AI";
  retryBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (!currentAudioFile) {
      return notify("Please load or record an audio file to retry caption.", true);
    }
    retryBtn.classList.add("spinning");
    retryBtn.innerHTML = "&#x23F3;";
    notify(`Re-transcribing caption #${idx + 1} with AI...`);

    try {
      const audioSlice = await sliceAudioBlob(currentAudioFile, cue.start, cue.end);
      const newText = await retranscribeCue({
        file: audioSlice,
        language: appSettings.language || "auto",
        settings: appSettings,
        contextText: cue.text
      });

      if (newText && newText.trim()) {
        pushCueHistory();
        cue.text = newText.trim();
        textArea.value = convertCaptionText(cue.text, subtitleEncoding);
        notify(`Retried caption #${idx + 1}: updated text!`);
      } else {
        notify(`No speech detected in segment #${idx + 1}.`, true);
      }
    } catch (err: any) {
      notify(`Retry error: ${err?.message || err}`, true);
    } finally {
      retryBtn.classList.remove("spinning");
      retryBtn.innerHTML = "&#x21BB;";
    }
  });

  // Delete Cue
  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "cue-icon-btn delete-btn";
  deleteBtn.innerHTML = "&#x1F5D1;";
  deleteBtn.title = "Delete caption";
  deleteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    pushCueHistory();
    currentCues.splice(idx, 1);
    currentCues = reindexCues(currentCues);
    renderCuesList();
  });

  const duration = Math.max(0.1, cue.end - cue.start);
  const charCount = cue.text.length;
  const cps = charCount / duration;

  const metricBadge = document.createElement("span");
  metricBadge.className = "cue-metric-badge";
  if (charCount > 50 || cps > 22) {
    metricBadge.classList.add("danger");
    metricBadge.textContent = `⚠ ${charCount} ch (${cps.toFixed(1)}/s)`;
    metricBadge.title = "High reading speed or line length! Consider splitting this card.";
  } else if (charCount > 38 || cps > 17) {
    metricBadge.classList.add("warning");
    metricBadge.textContent = `${charCount} ch (${cps.toFixed(1)}/s)`;
    metricBadge.title = "Moderate line length. Standard broadcast limit is ~38 characters.";
  } else {
    metricBadge.textContent = `${charCount} ch`;
    metricBadge.title = `Good reading pace: ${cps.toFixed(1)} chars/sec (${duration.toFixed(1)}s duration)`;
  }

  actionsRight.append(playBtn, retryBtn, deleteBtn);
  header.append(idxBadge, copyBadge, startInput, arrowSpan, endInput, metricBadge, actionsRight);

  // Text Area with Sinhala font preview
  const textArea = document.createElement("textarea");
  textArea.className = "cue-text-input";
  if (subtitleEncoding === "wije") textArea.classList.add("font-wije");
  else if (subtitleEncoding === "isi") textArea.classList.add("font-isi");
  textArea.value = convertCaptionText(cue.text, subtitleEncoding);

  textArea.addEventListener("click", () => {
    copySingleCue(cue, card, idx);
  });

  textArea.addEventListener("change", () => {
    pushCueHistory();
    cue.text = textArea.value;
  });

  textArea.addEventListener("input", () => {
    cue.text = textArea.value;
  });

  card.addEventListener("click", () => {
    copySingleCue(cue, card, idx);
  });

  card.append(header, textArea);
  return card;
}

function appendSingleCueCard(cue: SubtitleCue, idx: number): void {
  const card = buildCueCard(cue, idx);
  cueListEl.appendChild(card);
  cuesCountEl.textContent = `${currentCues.length} captions`;
  subtitlesSection.hidden = false;
  cueListEl.scrollTop = cueListEl.scrollHeight;
}

function renderCuesList(): void {
  cueListEl.innerHTML = "";
  cuesCountEl.textContent = `${currentCues.length} captions`;

  if (currentCues.length === 0) {
    cueListEl.innerHTML = '<div class="empty-state">No captions generated yet.</div>';
    return;
  }

  currentCues.forEach((cue, idx) => {
    cueListEl.appendChild(buildCueCard(cue, idx));
  });
}

// Toolbar Action Listeners
btnUndoCue.addEventListener("click", undo);
btnRedoCue.addEventListener("click", redo);

btnToggleSearch.addEventListener("click", () => {
  searchReplacePanel.hidden = !searchReplacePanel.hidden;
  if (!searchReplacePanel.hidden) {
    searchFindInput.focus();
  }
});

btnCloseSearch.addEventListener("click", () => {
  searchReplacePanel.hidden = true;
});

btnExecReplace.addEventListener("click", () => {
  const findText = searchFindInput.value;
  const replaceText = searchReplaceInput.value;
  if (!findText) return notify("Please enter text to find.", true);

  pushCueHistory();
  let count = 0;
  for (const cue of currentCues) {
    if (cue.text.includes(findText)) {
      cue.text = cue.text.replaceAll(findText, replaceText);
      count++;
    }
  }

  if (count > 0) {
    renderCuesList();
    notify(`Replaced in ${count} caption${count > 1 ? "s" : ""}!`);
  } else {
    notify(`"${findText}" not found in captions.`, true);
  }
});

btnRepairTiming.addEventListener("click", () => {
  if (currentCues.length <= 1) return notify("Not enough captions to repair.", true);
  pushCueHistory();
  currentCues = repairTimestampOverlaps(currentCues, 0.05);
  renderCuesList();
  notify("Repaired and aligned all overlapping timestamps!");
});

btnAddCue.addEventListener("click", () => {
  pushCueHistory();
  const lastCue = currentCues[currentCues.length - 1];
  const start = lastCue ? lastCue.end + 0.2 : 0;
  const end = start + 2.5;
  currentCues.push({
    id: currentCues.length + 1,
    start,
    end,
    text: "නව උපසිරැසි පේළිය"
  });
  renderCuesList();
  cueListEl.scrollTop = cueListEl.scrollHeight;
});

btnShiftBack.addEventListener("click", () => {
  pushCueHistory();
  currentCues = shiftCues(currentCues, -0.5);
  renderCuesList();
  notify("Shifted all subtitles earlier by 0.5s");
});

btnShiftForward.addEventListener("click", () => {
  pushCueHistory();
  currentCues = shiftCues(currentCues, 0.5);
  renderCuesList();
  notify("Shifted all subtitles later by 0.5s");
});

btnAutoCpl.addEventListener("click", () => {
  pushCueHistory();
  currentCues = optimizeAllCues(currentCues, appSettings.maxCpl || 38);
  renderCuesList();
  notify(`Split long sentences into ${currentCues.length} clean subtitle cards!`);
});

btnRecheckCues.addEventListener("click", async () => {
  if (currentCues.length === 0) return notify("No captions to recheck.", true);
  if (!currentAudioFile) return notify("Please load or record an audio file to recheck.", true);

  activeVerificationController = new VerificationController();
  btnPauseTranscribe.classList.remove("paused");
  pauseIcon.innerHTML = "&#x23F8;";
  pauseLabel.textContent = "Pause";
  btnPauseTranscribe.disabled = false;
  btnStopTranscribe.disabled = false;
  btnRecheckCues.disabled = true;

  setCaptionProgress(15, "🔍 Rechecking captions & scanning audio gaps...");
  notify("Rechecking captions and filling gaps...");

  try {
    const duration = audioPlayer.duration || (currentCues[currentCues.length - 1]?.end || 1);
    const vResult = await recheckAndFillGaps({
      audioBlob: currentAudioFile,
      audioDuration: duration,
      cues: currentCues,
      settings: appSettings,
      controller: activeVerificationController,
      onProgress: (pct, msg) => {
        setCaptionProgress(pct, msg);
      },
      onCueUpdated: () => renderCuesList(),
      onCueAdded: () => renderCuesList()
    });

    pushCueHistory();
    currentCues = optimizeAllCues(vResult.cues, appSettings.maxCpl || 38);
    renderCuesList();
    updateVerificationBadge(vResult.audit);
    setCaptionProgress(100, vResult.audit.summary);
    notify(`Recheck finished: ${vResult.recheckedCount} updated, ${vResult.filledGapsCount} gaps filled.`);
  } catch (err: any) {
    notify(`Recheck error: ${err.message}`, true);
  } finally {
    btnRecheckCues.disabled = false;
    btnPauseTranscribe.disabled = true;
    btnStopTranscribe.disabled = true;
    activeVerificationController = null;
    window.setTimeout(() => hideCaptionProgress(), 2000);
  }
});

// Export & Premiere Actions
function getProcessedCues(): SubtitleCue[] {
  return convertSubtitleCues(currentCues, subtitleEncoding);
}

async function importCurrentCaptions(): Promise<void> {
  if (currentCues.length === 0) return notify("No captions to import.", true);
  btnImportPremiere.disabled = true;
  try {
    const sequence = await inspectTimeline();
    const document: TimelineCaptionDocument = timelineDocument
      ? { ...timelineDocument, cues: getProcessedCues() }
      : { sequenceId: sequence.sequenceId, timelineStartSec: 0,
          audioDurationSec: Math.max(...currentCues.map(c => c.end)), cues: getProcessedCues() };
    const result = await premiereCaptionsClient.importCaptionDocument(document, sequence.sequenceName);
    notify(result.message, result.status === "failed");
  } catch (error: any) {
    notify(error.message || "Caption import failed.", true);
  } finally {
    btnImportPremiere.disabled = false;
  }
}

btnImportPremiere.addEventListener("click", () => { void importCurrentCaptions(); });

btnExportSrt.addEventListener("click", async () => {
  if (currentCues.length === 0) return notify("No captions to export.", true);
  const srt = generateSrt(getProcessedCues());
  notify("Exporting .SRT file...");
  const res = await exportSubtitleFile(srt, `AutoCap_${subtitleEncoding}.srt`, "srt");
  notify(res.message, !res.success && !res.message.includes("cancelled"));
});

btnExportVtt.addEventListener("click", async () => {
  if (currentCues.length === 0) return notify("No captions to export.", true);
  const vtt = generateVtt(getProcessedCues());
  notify("Exporting .VTT file...");
  const res = await exportSubtitleFile(vtt, `AutoCap_${subtitleEncoding}.vtt`, "vtt");
  notify(res.message, !res.success && !res.message.includes("cancelled"));
});

btnCopySrt.addEventListener("click", async () => {
  if (currentCues.length === 0) return notify("No captions to copy.", true);
  const srt = generateSrt(getProcessedCues());
  const copied = await copyText(srt);
  if (copied) {
    notify("Subtitles copied to clipboard!");
  } else {
    notify("Unable to copy subtitles to clipboard.", true);
  }
});

/* ==========================================================================
   TAB 2: Preserved Sinhala Typer
   ========================================================================== */
type OutputMode = "unicode" | "wije" | "isi";
type KeyboardLayout = "easy" | "wije";

const typerInput = $("#singlish") as HTMLTextAreaElement;
const typerOutput = $("#sinhala") as HTMLTextAreaElement;
const typerCount = $("#count");
const typerCopyButton = $("#copy") as HTMLButtonElement;
const typerUnicodeButton = $("#mode-unicode") as HTMLButtonElement;
const typerWijeButton = $("#mode-wije") as HTMLButtonElement;
const typerIsiButton = $("#mode-isi") as HTMLButtonElement;
const keyboardToggle = $("#keyboard-toggle") as HTMLButtonElement;
const hintsToggle = $("#hints-toggle") as HTMLButtonElement;
const keyboardPanel = $("#keyboard-panel");
const hintsPanel = $("#hints-panel");
const keyboardKeys = $("#keyboard-keys");
const keyboardFilters = $("#keyboard-filters");
const easyLayoutButton = $("#layout-easy") as HTMLButtonElement;
const wijeLayoutButton = $("#layout-wije") as HTMLButtonElement;

let unicodeOutput = "";
let typerOutputMode: OutputMode = "unicode";
let keyboardLayout: KeyboardLayout = "easy";
let phoneticCategory: PhoneticCategory["id"] = "quick";
let wijeShifted = false;

const OUTPUT_DETAILS: Record<OutputMode, { copy: string; copied: string; note: string }> = {
  unicode: {
    copy: "Copy Unicode",
    copied: "Sinhala Unicode copied.",
    note: "Portable Unicode text for Premiere and modern applications."
  },
  wije: {
    copy: "Copy Wije Text",
    copied: "Wije text copied. Apply Wije 6 after pasting.",
    note: "Unicode preview. Copy the legacy codes, paste them, then apply the Wije 6 font."
  },
  isi: {
    copy: "Copy ISI Text",
    copied: "ISI text copied. Apply a compatible ISI/Isiwara font after pasting.",
    note: "Unicode preview. Copy the legacy codes, paste them, then apply an ISI/Isiwara font."
  }
};

function typerClipboardValue(): string {
  if (typerOutputMode === "wije") return unicodeToDlManel(unicodeOutput);
  if (typerOutputMode === "isi") return unicodeToIsi(unicodeOutput);
  return unicodeOutput;
}

function renderTyper(): void {
  unicodeOutput = transliterate(typerInput.value);
  typerOutput.value = unicodeOutput;
  typerCount.textContent = `${Array.from(unicodeOutput).length} characters`;
}

function setTyperOutputMode(mode: OutputMode): void {
  typerOutputMode = mode;
  typerUnicodeButton.classList.toggle("active", mode === "unicode");
  typerWijeButton.classList.toggle("active", mode === "wije");
  typerIsiButton.classList.toggle("active", mode === "isi");
  typerCopyButton.textContent = OUTPUT_DETAILS[mode].copy;
  const noteEl = document.querySelector("#format-note");
  if (noteEl) noteEl.textContent = OUTPUT_DETAILS[mode].note;
}

function setToolPanel(name: "keyboard" | "hints", open: boolean): void {
  const showKeyboard = name === "keyboard" && open;
  const showHints = name === "hints" && open;
  keyboardPanel.hidden = !showKeyboard;
  hintsPanel.hidden = !showHints;
  keyboardToggle.classList.toggle("active", showKeyboard);
  hintsToggle.classList.toggle("active", showHints);
  keyboardToggle.setAttribute("aria-expanded", String(showKeyboard));
  hintsToggle.setAttribute("aria-expanded", String(showHints));
  if (showKeyboard) renderKeyboard();
}

function insertIntoTyperInput(value: string): void {
  applySelectionEdit(typerInput, insertAtSelection(typerInput.value, typerInput.selectionStart, typerInput.selectionEnd, value));
}

function addKeyButton(sinhala: string, token: string, onClick: () => void, action = false): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = action ? "keyboard-key action-key" : "keyboard-key";
  button.setAttribute("aria-label", action ? token : `${sinhala}, ${token}`);
  const glyph = document.createElement("span");
  glyph.className = "key-sinhala";
  glyph.textContent = sinhala;
  const keyToken = document.createElement("span");
  keyToken.className = "key-token";
  keyToken.textContent = token;
  button.append(glyph, keyToken);
  button.addEventListener("click", onClick);
  return button;
}

function renderPhoneticKeyboard(): void {
  keyboardFilters.hidden = false;
  keyboardFilters.textContent = "";
  for (const category of PHONETIC_CATEGORIES) {
    const filter = document.createElement("button");
    filter.type = "button";
    filter.textContent = category.label;
    filter.classList.toggle("active", category.id === phoneticCategory);
    filter.setAttribute("aria-pressed", String(category.id === phoneticCategory));
    filter.addEventListener("click", () => {
      phoneticCategory = category.id;
      renderPhoneticKeyboard();
    });
    keyboardFilters.appendChild(filter);
  }

  keyboardKeys.textContent = "";
  const activeCategory = PHONETIC_CATEGORIES.find(({ id }) => id === phoneticCategory)!;
  for (const item of activeCategory.keys) {
    keyboardKeys.appendChild(addKeyButton(item.output, item.label ?? item.token, () => insertIntoTyperInput(item.token)));
  }
  const cap = document.querySelector("#keyboard-caption");
  if (cap) cap.textContent = "Keys insert Singlish at the current cursor position.";
}

function renderWijesekaraKeyboard(): void {
  keyboardFilters.hidden = true;
  keyboardKeys.textContent = "";
  for (const row of WIJESEKARA_ROWS) {
    const rowElement = document.createElement("div");
    rowElement.className = "keyboard-row";
    for (const item of row) {
      const value = wijeShifted && item.shifted ? item.shifted : item.normal;
      rowElement.appendChild(addKeyButton(value, wijeShifted ? item.physical.toUpperCase() : item.physical, () => insertIntoTyperInput(value)));
    }
    keyboardKeys.appendChild(rowElement);
  }

  const actions = document.createElement("div");
  actions.className = "keyboard-row";
  const shift = addKeyButton("\u21E7", wijeShifted ? "Shift on" : "Shift", () => {
    wijeShifted = !wijeShifted;
    renderWijesekaraKeyboard();
  }, true);
  shift.classList.toggle("active", wijeShifted);
  actions.appendChild(shift);
  actions.appendChild(addKeyButton("Space", "space", () => insertIntoTyperInput(" "), true));
  actions.appendChild(addKeyButton("\u232B", "backspace", () => {
    applySelectionEdit(typerInput, deleteAtSelection(typerInput.value, typerInput.selectionStart, typerInput.selectionEnd));
  }, true));
  actions.appendChild(addKeyButton("\u21B5", "enter", () => insertIntoTyperInput("\n"), true));
  keyboardKeys.appendChild(actions);
  const cap = document.querySelector("#keyboard-caption");
  if (cap) cap.textContent = "SLS Wijesekara keys insert Sinhala Unicode directly.";
}

function renderKeyboard(): void {
  const easy = keyboardLayout === "easy";
  easyLayoutButton.classList.toggle("active", easy);
  wijeLayoutButton.classList.toggle("active", !easy);
  if (easy) renderPhoneticKeyboard();
  else renderWijesekaraKeyboard();
}

typerInput.addEventListener("input", renderTyper);
typerUnicodeButton.addEventListener("click", () => setTyperOutputMode("unicode"));
typerWijeButton.addEventListener("click", () => setTyperOutputMode("wije"));
typerIsiButton.addEventListener("click", () => setTyperOutputMode("isi"));
keyboardToggle.addEventListener("click", () => setToolPanel("keyboard", keyboardPanel.hidden));
hintsToggle.addEventListener("click", () => setToolPanel("hints", hintsPanel.hidden));
easyLayoutButton.addEventListener("click", () => { keyboardLayout = "easy"; renderKeyboard(); });
wijeLayoutButton.addEventListener("click", () => { keyboardLayout = "wije"; renderKeyboard(); });

typerCopyButton.addEventListener("click", async () => {
  if (!unicodeOutput) return notify("Type some Singlish first.", true);
  try {
    const value = typerClipboardValue();
    if (!copyToHostClipboard(value)) await navigator.clipboard.writeText(value);
    notify(OUTPUT_DETAILS[typerOutputMode].copied);
  } catch {
    notify("Unable to access the clipboard.", true);
  }
});

const pasteBtn = document.querySelector("#paste");
pasteBtn?.addEventListener("click", async () => {
  try {
    typerInput.value = readFromHostClipboard() ?? (await navigator.clipboard.readText());
    renderTyper();
    typerInput.focus();
  } catch {
    typerInput.focus();
    notify("Press Ctrl+V to paste into the Singlish field.", true);
  }
});

/* ==========================================================================
   TAB 3: Settings
   ========================================================================== */
const inputGeminiKey = document.querySelector<HTMLInputElement>("#input-gemini-key")!;
const inputGroqKey = document.querySelector<HTMLInputElement>("#input-groq-key")!;
const inputOpenaiKey = document.querySelector<HTMLInputElement>("#input-openai-key")!;
const inputMaxCpl = document.querySelector<HTMLInputElement>("#input-max-cpl")!;
const btnSaveSettings = document.querySelector<HTMLButtonElement>("#btn-save-settings")!;
const prefAutoImport = document.querySelector<HTMLInputElement>("#pref-auto-import");

const toggleGeminiKey = document.querySelector<HTMLButtonElement>("#toggle-gemini-key");
const toggleGroqKey = document.querySelector<HTMLButtonElement>("#toggle-groq-key");
const toggleOpenaiKey = document.querySelector<HTMLButtonElement>("#toggle-openai-key");

const geminiKeyStatus = document.querySelector<HTMLSpanElement>("#gemini-key-status");
const groqKeyStatus = document.querySelector<HTMLSpanElement>("#groq-key-status");
const openaiKeyStatus = document.querySelector<HTMLSpanElement>("#openai-key-status");

function updateKeyBadges(): void {
  geminiKeyStatus?.classList.toggle("active", !!inputGeminiKey?.value.trim());
  groqKeyStatus?.classList.toggle("active", !!inputGroqKey?.value.trim());
  openaiKeyStatus?.classList.toggle("active", !!inputOpenaiKey?.value.trim());
}

function setupKeyToggle(btn: HTMLButtonElement | null, input: HTMLInputElement | null): void {
  if (!btn || !input) return;
  btn.addEventListener("click", () => {
    const isPass = input.type === "password";
    input.type = isPass ? "text" : "password";
    btn.innerHTML = isPass ? "&#x1F648;" : "&#x1F441;";
    btn.title = isPass ? "Hide Key" : "Show Key";
  });
}

setupKeyToggle(toggleGeminiKey, inputGeminiKey);
setupKeyToggle(toggleGroqKey, inputGroqKey);
setupKeyToggle(toggleOpenaiKey, inputOpenaiKey);

inputGeminiKey.value = appSettings.geminiApiKey || "";
inputGroqKey.value = appSettings.groqApiKey || "";
inputOpenaiKey.value = appSettings.openaiApiKey || "";
inputMaxCpl.value = String(appSettings.maxCpl || 38);
if (prefAutoImport) prefAutoImport.checked = appSettings.autoImportCaptions === true;
selectLanguage.value = appSettings.language || "auto";
selectProvider.value = appSettings.sttProvider || "gemini";
updateKeyBadges();

// Auto-save immediately on input so keys are never lost even if user doesn't click "Save Settings"
inputGeminiKey.addEventListener("input", () => {
  appSettings.geminiApiKey = inputGeminiKey.value.trim();
  saveSettings(appSettings);
  updateKeyBadges();
});

inputGroqKey.addEventListener("input", () => {
  appSettings.groqApiKey = inputGroqKey.value.trim();
  saveSettings(appSettings);
  updateKeyBadges();
});

inputOpenaiKey.addEventListener("input", () => {
  appSettings.openaiApiKey = inputOpenaiKey.value.trim();
  saveSettings(appSettings);
  updateKeyBadges();
});

inputMaxCpl.addEventListener("change", () => {
  appSettings.maxCpl = parseInt(inputMaxCpl.value, 10) || 38;
  saveSettings(appSettings);
});

prefAutoImport?.addEventListener("change", () => {
  appSettings.autoImportCaptions = prefAutoImport.checked;
  saveSettings(appSettings);
});

selectLanguage.addEventListener("change", () => {
  appSettings.language = selectLanguage.value as LanguageChoice;
  saveSettings(appSettings);
});

selectProvider.addEventListener("change", () => {
  appSettings.sttProvider = selectProvider.value as SttProvider;
  saveSettings(appSettings);
});

const btnTestGemini = document.querySelector<HTMLButtonElement>("#btn-test-gemini");
const settingsFeedback = document.querySelector<HTMLDivElement>("#settings-save-feedback");

btnTestGemini?.addEventListener("click", async () => {
  const key = inputGeminiKey.value.trim();
  if (!key) {
    notify("Please enter a Gemini API Key to test.", true);
    inputGeminiKey.focus();
    return;
  }
  btnTestGemini.disabled = true;
  btnTestGemini.textContent = "⏳ Testing...";
  btnTestGemini.className = "btn-test-key";
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`;
    const res = await fetch(url, { method: "GET" });
    if (res.ok) {
      btnTestGemini.textContent = "✓ Key Valid!";
      btnTestGemini.className = "btn-test-key success";
      notify("✓ Gemini API Key is valid and working!");
      appSettings.geminiApiKey = key;
      saveSettings(appSettings);
      updateKeyBadges();
      if (settingsFeedback) {
        settingsFeedback.textContent = "✓ Gemini API Key is valid and active!";
        settingsFeedback.classList.remove("error");
      }
    } else {
      const data = await res.json().catch(() => ({}));
      const errDetail = data?.error?.message || `HTTP ${res.status}`;
      btnTestGemini.textContent = "❌ Invalid Key";
      btnTestGemini.className = "btn-test-key error";
      notify(`Gemini API Error: ${errDetail}`, true);
      if (settingsFeedback) {
        settingsFeedback.textContent = `❌ Gemini Error: ${errDetail}`;
        settingsFeedback.classList.add("error");
      }
    }
  } catch (err: any) {
    btnTestGemini.textContent = "❌ Connection Failed";
    btnTestGemini.className = "btn-test-key error";
    notify(`Network Error: ${err.message}`, true);
  } finally {
    window.setTimeout(() => {
      btnTestGemini.disabled = false;
      btnTestGemini.textContent = "⚡ Test Key";
      btnTestGemini.className = "btn-test-key";
    }, 4500);
  }
});

btnSaveSettings.addEventListener("click", () => {
  appSettings.geminiApiKey = inputGeminiKey.value.trim();
  appSettings.groqApiKey = inputGroqKey.value.trim();
  appSettings.openaiApiKey = inputOpenaiKey.value.trim();
  appSettings.maxCpl = parseInt(inputMaxCpl.value, 10) || 38;
  saveSettings(appSettings);
  updateKeyBadges();

  btnSaveSettings.textContent = "✓ Saved Permanently!";
  btnSaveSettings.style.background = "#10b981";
  if (settingsFeedback) {
    settingsFeedback.textContent = "✓ Settings & API keys saved to disk (C:\\Users\\PC\\.autocap-config.json)";
    settingsFeedback.classList.remove("error");
  }

  notify("✓ Settings & API keys saved permanently to disk!");

  window.setTimeout(() => {
    btnSaveSettings.textContent = "Save Settings";
    btnSaveSettings.style.background = "";
  }, 2500);
});

// Settings Language Selector sync
const settingsLanguageSelect = document.querySelector<HTMLSelectElement>("#settings-language-select");
if (settingsLanguageSelect) {
  settingsLanguageSelect.value = appSettings.language || "si";
  settingsLanguageSelect.addEventListener("change", () => {
    appSettings.language = settingsLanguageSelect.value as any;
    selectLanguage.value = settingsLanguageSelect.value;
    saveSettings(appSettings);
  });
}

// Settings Output Format Live Preview (Matching Reference Design)
const settingsPreviewBox = document.querySelector<HTMLDivElement>("#settings-preview-box");
const settingsBtnUnicode = document.querySelector<HTMLButtonElement>("#settings-mode-unicode");
const settingsBtnWije = document.querySelector<HTMLButtonElement>("#settings-mode-wije");
const settingsBtnIsi = document.querySelector<HTMLButtonElement>("#settings-mode-isi");

function updateSettingsFormat(encoding: CaptionEncoding): void {
  subtitleEncoding = encoding;
  appSettings.defaultEncoding = encoding;
  saveSettings(appSettings);

  settingsBtnUnicode?.classList.toggle("active", encoding === "unicode");
  settingsBtnWije?.classList.toggle("active", encoding === "wije");
  settingsBtnIsi?.classList.toggle("active", encoding === "isi");

  if (settingsPreviewBox) {
    settingsPreviewBox.className = `format-preview-card font-${encoding}`;
    const sampleText = "මම අද ගෙදර යනවා";
    settingsPreviewBox.textContent = convertCaptionText(sampleText, encoding);
  }
}

settingsBtnUnicode?.addEventListener("click", () => updateSettingsFormat("unicode"));
settingsBtnWije?.addEventListener("click", () => updateSettingsFormat("wije"));
settingsBtnIsi?.addEventListener("click", () => updateSettingsFormat("isi"));

// Initial setup of settings preview
updateSettingsFormat(appSettings.defaultEncoding || "unicode");

// Settings Reset Button
const btnResetSettings = document.querySelector<HTMLButtonElement>("#btn-reset-settings");
btnResetSettings?.addEventListener("click", () => {
  inputGeminiKey.value = "";
  inputGroqKey.value = "";
  inputOpenaiKey.value = "";
  inputMaxCpl.value = "38";
  if (prefAutoImport) prefAutoImport.checked = false;
  appSettings.autoImportCaptions = false;
  if (settingsLanguageSelect) settingsLanguageSelect.value = "si";
  selectLanguage.value = "si";
  selectProvider.value = "gemini";
  updateSettingsFormat("unicode");
  updateKeyBadges();
  notify("Settings reset to default values");
});

// ==========================================================================
// Audio Source Scope Segmented Selector
// ==========================================================================
let activeSourceKind: "sequence" | "track" | "range" = "range";
const btnSrcKindSeq = document.querySelector<HTMLButtonElement>("#src-kind-seq");
const btnSrcKindTrack = document.querySelector<HTMLButtonElement>("#src-kind-track");
const btnSrcKindRange = document.querySelector<HTMLButtonElement>("#src-kind-range");
const trackSelectWrapper = document.querySelector<HTMLDivElement>("#track-select-wrapper");

function setAudioSourceKind(kind: "sequence" | "track" | "range"): void {
  activeSourceKind = kind;
  btnSrcKindSeq?.classList.toggle("active", kind === "sequence");
  btnSrcKindTrack?.classList.toggle("active", kind === "track");
  btnSrcKindRange?.classList.toggle("active", kind === "range");
  if (trackSelectWrapper) {
    trackSelectWrapper.hidden = kind !== "track";
  }
  btnLoadTrack.textContent = kind === "sequence"
    ? "Load Entire Sequence"
    : kind === "track"
      ? "Load Audio Track"
      : "Load Selected Range";
}

btnSrcKindSeq?.addEventListener("click", () => setAudioSourceKind("sequence"));
btnSrcKindTrack?.addEventListener("click", () => setAudioSourceKind("track"));
btnSrcKindRange?.addEventListener("click", () => setAudioSourceKind("range"));

// ==========================================================================
// Audio Preset Management (Settings Tab)
// ==========================================================================
const audioPresetSelect = document.querySelector<HTMLSelectElement>("#audio-preset-select");
const inputAudioPresetPath = document.querySelector<HTMLInputElement>("#input-audio-preset-path");
const btnFindPresets = document.querySelector<HTMLButtonElement>("#btn-find-presets");
const btnBrowsePreset = document.querySelector<HTMLButtonElement>("#btn-browse-preset");
const btnTestPreset = document.querySelector<HTMLButtonElement>("#btn-test-preset");
const presetStatusBadge = document.querySelector<HTMLElement>("#preset-status-badge");
const presetFeedback = document.querySelector<HTMLDivElement>("#preset-feedback");

// Populate initial preset
if (inputAudioPresetPath) {
  inputAudioPresetPath.value = audioPresetManager.getSelectedPresetPath();
}

function refreshPresetValidation(): void {
  const path = (inputAudioPresetPath?.value || "").trim();
  const validation = audioPresetManager.validatePreset(path);
  if (presetStatusBadge) {
    presetStatusBadge.textContent = validation.valid ? "✓ WAV Ready" : "Setup needed";
    presetStatusBadge.classList.toggle("active", validation.valid);
  }
  if (!validation.valid && path && presetFeedback) {
    presetFeedback.textContent = validation.reason || "Choose an audio-only Waveform Audio preset.";
    presetFeedback.className = "settings-feedback error";
  }
}

refreshPresetValidation();

audioPresetSelect?.addEventListener("change", () => {
  if (audioPresetSelect.value && inputAudioPresetPath) {
    inputAudioPresetPath.value = audioPresetSelect.value;
    audioPresetManager.setSelectedPresetPath(audioPresetSelect.value);
    refreshPresetValidation();
  }
});

inputAudioPresetPath?.addEventListener("input", () => {
  audioPresetManager.setSelectedPresetPath(inputAudioPresetPath.value);
  refreshPresetValidation();
});

btnFindPresets?.addEventListener("click", async () => {
  if (presetFeedback) {
    presetFeedback.textContent = "Scanning for installed .epr presets...";
    presetFeedback.className = "settings-feedback";
  }
  const presets = await audioPresetManager.discoverPresets();
  if (audioPresetSelect) {
    audioPresetSelect.innerHTML = "";
    if (presets.length === 0) {
      audioPresetSelect.innerHTML = '<option value="">No installed .epr presets found. Specify custom path below.</option>';
    } else {
      presets.forEach((p) => {
        const opt = document.createElement("option");
        opt.value = p.path;
        opt.textContent = `${p.name} (${p.formatSuggestion})`;
        audioPresetSelect.appendChild(opt);
      });
      if (inputAudioPresetPath) inputAudioPresetPath.value = presets[0].path;
      audioPresetManager.setSelectedPresetPath(presets[0].path);
      refreshPresetValidation();
      if (presetFeedback) {
        presetFeedback.textContent = `✓ Found ${presets.length} export presets! Selected: ${presets[0].name}`;
        presetFeedback.className = "settings-feedback success";
      }
    }
  }
});

btnBrowsePreset?.addEventListener("click", () => {
  inputAudioPresetPath?.focus();
  notify("Paste or edit the full path to your .epr audio export preset.");
});

btnTestPreset?.addEventListener("click", async () => {
  const path = (inputAudioPresetPath?.value || "").trim();
  const validation = audioPresetManager.validatePreset(path);
  if (!validation.valid) {
    notify(`Invalid Preset: ${validation.reason}`, true);
    if (presetFeedback) {
      presetFeedback.textContent = `❌ ${validation.reason}`;
      presetFeedback.className = "settings-feedback error";
    }
    return;
  }

  notify("Testing audio export with selected preset...");
  try {
    const testReq: AudioSourceRequest = {
      kind: "range",
      sequenceId: "active_sequence",
      startSec: 0,
      endSec: 3.0
    };
    const res = await premiereAudioClient.exportTimelineAudio(testReq, "preset_test", path);
    notify(`✓ Export test succeeded! (${res.durationSec}s audio generated)`);
    if (presetFeedback) {
      presetFeedback.textContent = `✓ Export test passed (${res.durationSec}s audio)! Preset is functional.`;
      presetFeedback.className = "settings-feedback success";
    }
  } catch (err: any) {
    notify(`Export test failed: ${err.message}`, true);
    if (presetFeedback) {
      presetFeedback.textContent = `❌ Test Failed: ${err.message}`;
      presetFeedback.className = "settings-feedback error";
    }
  }
});

// ==========================================================================
// Gemini Model Tier Preference & Audio Diagnostics
// ==========================================================================
const selectGeminiTier = document.querySelector<HTMLSelectElement>("#select-gemini-tier");
const btnTestGeminiAudio = document.querySelector<HTMLButtonElement>("#btn-test-gemini-audio");
const geminiDiagnosticFeedback = document.querySelector<HTMLDivElement>("#gemini-diagnostic-feedback");

if (selectGeminiTier) {
  selectGeminiTier.value = (appSettings as any).geminiModelPreference || "flash";
  selectGeminiTier.addEventListener("change", () => {
    (appSettings as any).geminiModelPreference = selectGeminiTier.value;
    saveSettings(appSettings);
  });
}

btnTestGeminiAudio?.addEventListener("click", async () => {
  const key = inputGeminiKey.value.trim() || appSettings.geminiApiKey;
  if (!key) {
    notify("Please enter a Gemini API Key to test audio modality.", true);
    inputGeminiKey.focus();
    return;
  }
  if (btnTestGeminiAudio) {
    btnTestGeminiAudio.disabled = true;
    btnTestGeminiAudio.textContent = "⏳ Testing Audio Modality...";
  }
  try {
    const pref = (selectGeminiTier?.value as "flash" | "pro") || "flash";
    const result = await runGeminiAudioDiagnostic(key, pref);
    if (result.success) {
      notify(`✓ ${result.message}`);
      if (geminiDiagnosticFeedback) {
        geminiDiagnosticFeedback.textContent = `✓ ${result.message}`;
        geminiDiagnosticFeedback.className = "settings-feedback success";
      }
    } else {
      notify(`Audio Diagnostic: ${result.message}`, true);
      if (geminiDiagnosticFeedback) {
        geminiDiagnosticFeedback.textContent = `❌ ${result.message}`;
        geminiDiagnosticFeedback.className = "settings-feedback error";
      }
    }
  } finally {
    if (btnTestGeminiAudio) {
      btnTestGeminiAudio.disabled = false;
      btnTestGeminiAudio.textContent = "🧪 Test Audio Modality";
    }
  }
});

// ==========================================================================
// MOGRT Insertion in Sinhala Typer
// ==========================================================================
const btnToggleMogrt = document.querySelector<HTMLButtonElement>("#btn-toggle-mogrt");
const mogrtConfigPanel = document.querySelector<HTMLDivElement>("#mogrt-config-panel");
const mogrtTrackSelect = document.querySelector<HTMLSelectElement>("#mogrt-track-select");
const mogrtDurationInput = document.querySelector<HTMLInputElement>("#mogrt-duration-input");
const mogrtTemplateInput = document.querySelector<HTMLInputElement>("#mogrt-template-input");
const btnBrowseMogrt = document.querySelector<HTMLButtonElement>("#btn-browse-mogrt");
const btnExecuteInsertMogrt = document.querySelector<HTMLButtonElement>("#btn-execute-insert-mogrt");

btnToggleMogrt?.addEventListener("click", () => {
  if (mogrtConfigPanel) {
    mogrtConfigPanel.hidden = !mogrtConfigPanel.hidden;
  }
});

btnBrowseMogrt?.addEventListener("click", () => {
  mogrtTemplateInput?.focus();
  notify("Enter or paste the path to your verified .mogrt template file.");
});

btnExecuteInsertMogrt?.addEventListener("click", async () => {
  const text = (document.querySelector<HTMLTextAreaElement>("#sinhala")?.value || "").trim();
  if (!text) {
    return notify("Please type or convert some Sinhala text first.", true);
  }
  const templatePath = (mogrtTemplateInput?.value || "").trim();
  const trackIdx = parseInt(mogrtTrackSelect?.value || "2", 10);
  const dur = parseFloat(mogrtDurationInput?.value || "4.0");

  btnExecuteInsertMogrt.disabled = true;
  btnExecuteInsertMogrt.textContent = "⏳ Inserting...";
  try {
    const res = await premiereGraphicsClient.insertGraphic({
      sequenceId: "active_sequence",
      templatePath,
      text,
      encoding: subtitleEncoding,
      targetVideoTrackIndex: trackIdx,
      durationSec: dur
    });

    if (res.success) {
      notify(`✓ ${res.message}`);
      if (mogrtConfigPanel) mogrtConfigPanel.hidden = true;
    } else {
      notify(`MOGRT Error: ${res.message}`, true);
    }
  } catch (err: any) {
    notify(`Failed to insert graphic: ${err.message}`, true);
  } finally {
    btnExecuteInsertMogrt.disabled = false;
    btnExecuteInsertMogrt.textContent = "✨ Place Graphic on Playhead";
  }
});

// Initial sequence scan
scanPremiereTracks();

// Live Companion Worker Backend Connection Check
const statusReadyEl = document.querySelector<HTMLElement>(".status-ready");
checkLocalWorkerHealth().then((health) => {
  if (statusReadyEl) {
    if (health && canProcessTranscription(health)) {
      statusReadyEl.innerHTML = `<span class="status-dot"></span> Ready (Worker Active)`;
      statusReadyEl.title = `AutoCap Local Media Worker companion process active (${health.version})`;
    } else {
      statusReadyEl.innerHTML = `<span class="status-dot"></span> Ready (Direct Engine)`;
      statusReadyEl.title = "Direct in-browser engine active";
    }
  }
}).catch(() => {});
