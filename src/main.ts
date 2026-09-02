import "./styles.css";
import { unicodeToDlManel } from "sinhala-unicode-coverter";
import { PHONETIC_CATEGORIES, WIJESEKARA_ROWS, type PhoneticCategory } from "./core/keyboardLayouts";
import { unicodeToIsi } from "./core/isiConverter";
import { transliterate } from "./core/transliterator";
import { copyToHostClipboard, readFromHostClipboard } from "./platform/clipboard";
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
import { transcribeAudio } from "./services/sttService";
import { AudioRecorder } from "./services/audioRecorder";
import {
  downloadTextFile,
  getSequenceAudioTracks,
  importSubtitlesIntoPremiere,
  loadMediaFileFromPath,
  type SequenceAudioTrackInfo
} from "./platform/premiereBridge";
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
let currentCues: SubtitleCue[] = [];
let subtitleEncoding: CaptionEncoding = "unicode";
let detectedIsSinhala = false;
let sequenceTracks: SequenceAudioTrackInfo[] = [];
const audioRecorder = new AudioRecorder();

// Global Notification
const messageEl = $("#message");
function notify(text: string, error = false): void {
  messageEl.textContent = text;
  messageEl.classList.toggle("error", error);
  window.setTimeout(() => {
    if (messageEl.textContent === text) messageEl.textContent = "";
  }, 3200);
}

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
const btnRefreshTracks = $("#btn-refresh-tracks") as HTMLButtonElement;
const btnLoadTrack = $("#btn-load-track") as HTMLButtonElement;
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

const btnAddCue = $("#btn-add-cue") as HTMLButtonElement;
const btnShiftBack = $("#btn-shift-back") as HTMLButtonElement;
const btnShiftForward = $("#btn-shift-forward") as HTMLButtonElement;
const btnAutoCpl = $("#btn-auto-cpl") as HTMLButtonElement;

function loadAudioFile(file: File | Blob, name = "Audio Recording"): void {
  currentAudioFile = file;
  const objectUrl = URL.createObjectURL(file);
  audioPlayer.src = objectUrl;
  audioFilename.textContent = name;
  audioPreviewCard.hidden = false;

  audioPlayer.onloadedmetadata = () => {
    audioDuration.textContent = formatDisplayDuration(audioPlayer.duration);
  };
  $("#dropzone-label").textContent = `Loaded: ${name}`;
}

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
    selectAudioTrack.innerHTML = "";

    if (sequenceTracks.length === 0) {
      selectAudioTrack.innerHTML = `<option value="">(No audio tracks in active sequence)</option>`;
      notify("No audio tracks found in sequence.");
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

    notify(`Found ${sequenceTracks.length} audio tracks in "${seqInfo.sequenceName || "Sequence"}"`);
  } catch (err: any) {
    notify(`Failed to scan tracks: ${err.message}`, true);
  }
}

btnRefreshTracks.addEventListener("click", scanPremiereTracks);

btnLoadTrack.addEventListener("click", async () => {
  if (sequenceTracks.length === 0) {
    await scanPremiereTracks();
  }

  const trackIndex = parseInt(selectAudioTrack.value, 10);
  if (isNaN(trackIndex)) {
    return notify("Please select an audio track first.", true);
  }

  const track = sequenceTracks.find((t) => t.index === trackIndex);
  if (!track || track.clips.length === 0) {
    return notify(`Track A${trackIndex + 1} has no audio clips on the timeline.`, true);
  }

  const validClips = track.clips.filter((c) => c.mediaPath && c.mediaPath.trim() !== "");
  if (validClips.length === 0) {
    return notify(`No media file path found for clips on Track A${trackIndex + 1}.`, true);
  }

  // Sort by duration descending to pick the primary dialogue/speech media file
  const sortedClips = [...validClips].sort((a, b) => (b.duration || 0) - (a.duration || 0));
  const clip = sortedClips[0];

  setTrackProgress(10, `Loading Track A${trackIndex + 1}: ${clip.name}...`);
  btnLoadTrack.disabled = true;

  try {
    const { blob, filename } = await loadMediaFileFromPath(clip.mediaPath, (percent, msg) => {
      setTrackProgress(percent, msg);
    });
    loadAudioFile(blob, filename);
    const cutsInfo = track.clipCount > 1 ? ` (${track.clipCount} cuts)` : "";
    notify(`Loaded Track A${trackIndex + 1}: ${filename}${cutsInfo}`);
    setTrackProgress(100, `Track A${trackIndex + 1} loaded!`);
    window.setTimeout(() => hideTrackProgress(), 1200);
  } catch (err: any) {
    hideTrackProgress();
    notify(err.message || "Failed to load audio from Premiere track.", true);
  } finally {
    btnLoadTrack.disabled = false;
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

// Transcribe Button
btnTranscribe.addEventListener("click", async () => {
  if (!currentAudioFile) {
    return notify("Please load or record an audio file first.", true);
  }

  appSettings.language = selectLanguage.value as LanguageChoice;
  appSettings.sttProvider = selectProvider.value as SttProvider;

  // Clear previous cues for live line-by-line appearance
  currentCues = [];
  cueListEl.innerHTML = "";
  cuesCountEl.textContent = "0 captions";

  setCaptionProgress(10, "Connecting to AI Engine...");
  btnTranscribe.disabled = true;

  try {
    const result = await transcribeAudio({
      file: currentAudioFile,
      settings: appSettings,
      onProgress: (p) => {
        const pct = p.percent ?? 50;
        setCaptionProgress(pct, p.message);
      },
      onCue: (newCue) => {
        currentCues.push(newCue);
        appendSingleCueCard(newCue, currentCues.length - 1);
        const count = currentCues.length;
        setCaptionProgress(Math.min(94, 20 + count * 4), `Generated line #${count}...`);
      }
    });

    if (result.cues.length === 0 && currentCues.length === 0) {
      notify("No speech detected in audio.", true);
      return;
    }

    setCaptionProgress(96, "Optimizing line lengths & timestamps...");
    const baseCues = result.cues.length > 0 ? result.cues : currentCues;
    currentCues = optimizeAllCues(baseCues, appSettings.maxCpl || 38);
    detectedIsSinhala = result.isSinhala || isSinhalaText(currentCues.map((c) => c.text).join(" "));
    updateSinhalaUiState();

    subtitlesSection.hidden = false;
    renderCuesList();
    setCaptionProgress(100, `Generated ${currentCues.length} captions!`);
    notify(`Generated ${currentCues.length} captions using ${result.providerUsed}!`);
  } catch (err: any) {
    notify(err.message || "Transcription failed.", true);
  } finally {
    btnTranscribe.disabled = false;
    window.setTimeout(() => hideCaptionProgress(), 1400);
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
    if (!copyToHostClipboard(convertedText)) {
      await navigator.clipboard.writeText(convertedText);
    }

    // Visual card badge feedback
    card.classList.add("copied");
    const badge = card.querySelector(".cue-copy-badge") as HTMLElement;
    if (badge) badge.textContent = "✓ Copied!";

    setTimeout(() => {
      card.classList.remove("copied");
      if (badge) badge.textContent = "";
    }, 1600);

    notify(`Copied Line #${idx + 1} to clipboard!`);
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

  // Delete Cue
  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "cue-icon-btn delete-btn";
  deleteBtn.innerHTML = "&#x1F5D1;";
  deleteBtn.title = "Delete caption";
  deleteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    currentCues.splice(idx, 1);
    currentCues = reindexCues(currentCues);
    renderCuesList();
  });

  actionsRight.append(playBtn, deleteBtn);
  header.append(idxBadge, copyBadge, startInput, arrowSpan, endInput, actionsRight);

  // Text Area with Sinhala font preview
  const textArea = document.createElement("textarea");
  textArea.className = "cue-text-input";
  if (subtitleEncoding === "wije") textArea.classList.add("font-wije");
  else if (subtitleEncoding === "isi") textArea.classList.add("font-isi");
  textArea.value = convertCaptionText(cue.text, subtitleEncoding);

  textArea.addEventListener("click", () => {
    copySingleCue(cue, card, idx);
  });

  textArea.addEventListener("input", () => {
    cue.text = textArea.value;
  });

  // Click on card copies text automatically!
  card.addEventListener("click", () => {
    copySingleCue(cue, card, idx);
  });

  card.append(header, textArea);
  return card;
}

// Progressively appends a single finished caption line to the live UI
function appendSingleCueCard(cue: SubtitleCue, idx: number): void {
  subtitlesSection.hidden = false;
  cuesCountEl.textContent = `${currentCues.length} captions`;

  if (!detectedIsSinhala && isSinhalaText(cue.text)) {
    detectedIsSinhala = true;
    updateSinhalaUiState();
  }

  const card = buildCueCard(cue, idx);
  cueListEl.appendChild(card);
  card.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// Render Cues List with Click-to-Copy
function renderCuesList(): void {
  cuesCountEl.textContent = `${currentCues.length} captions`;
  cueListEl.innerHTML = "";

  currentCues.forEach((cue, idx) => {
    const card = buildCueCard(cue, idx);
    cueListEl.appendChild(card);
  });
}

// Subtitle Tools
btnAddCue.addEventListener("click", () => {
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
  currentCues = shiftCues(currentCues, -0.5);
  renderCuesList();
  notify("Shifted all subtitles earlier by 0.5s");
});

btnShiftForward.addEventListener("click", () => {
  currentCues = shiftCues(currentCues, 0.5);
  renderCuesList();
  notify("Shifted all subtitles later by 0.5s");
});

btnAutoCpl.addEventListener("click", () => {
  currentCues = optimizeAllCues(currentCues, appSettings.maxCpl || 38);
  renderCuesList();
  notify(`Split long sentences into ${currentCues.length} clean subtitle cards!`);
});

// Export & Premiere Actions
function getProcessedCues(): SubtitleCue[] {
  return convertSubtitleCues(currentCues, subtitleEncoding);
}

btnImportPremiere.addEventListener("click", async () => {
  if (currentCues.length === 0) return notify("No captions to import.", true);
  const srtContent = generateSrt(getProcessedCues());
  notify("Importing captions to Premiere Pro...");
  const result = await importSubtitlesIntoPremiere(srtContent, `AutoCap_${subtitleEncoding}.srt`);
  notify(result.message, !result.success && !result.message.includes("Downloaded"));
});

btnExportSrt.addEventListener("click", () => {
  if (currentCues.length === 0) return notify("No captions to export.", true);
  const srt = generateSrt(getProcessedCues());
  downloadTextFile(srt, `AutoCap_${subtitleEncoding}.srt`);
  notify("Exported .SRT file.");
});

btnExportVtt.addEventListener("click", () => {
  if (currentCues.length === 0) return notify("No captions to export.", true);
  const vtt = generateVtt(getProcessedCues());
  downloadTextFile(vtt, `AutoCap_${subtitleEncoding}.vtt`, "text/vtt;charset=utf-8");
  notify("Exported .VTT file.");
});

btnCopySrt.addEventListener("click", async () => {
  if (currentCues.length === 0) return notify("No captions to copy.", true);
  const srt = generateSrt(getProcessedCues());
  if (!copyToHostClipboard(srt)) {
    await navigator.clipboard.writeText(srt);
  }
  notify("Subtitles copied to clipboard!");
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
  $("#format-note").textContent = OUTPUT_DETAILS[mode].note;
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
  $("#keyboard-caption").textContent = "Keys insert Singlish at the current cursor position.";
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
  $("#keyboard-caption").textContent = "SLS Wijesekara keys insert Sinhala Unicode directly.";
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

$("#paste").addEventListener("click", async () => {
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
const inputGroqKey = $("#input-groq-key") as HTMLInputElement;
const inputOpenAIKey = $("#input-openai-key") as HTMLInputElement;
const inputGeminiKey = $("#input-gemini-key") as HTMLInputElement;
const inputMaxCpl = $("#input-max-cpl") as HTMLInputElement;
const btnSaveSettings = $("#btn-save-settings") as HTMLButtonElement;

function populateSettingsUI(): void {
  inputGroqKey.value = appSettings.groqApiKey || "";
  inputOpenAIKey.value = appSettings.openaiApiKey || "";
  inputGeminiKey.value = appSettings.geminiApiKey || "";
  inputMaxCpl.value = String(appSettings.maxCpl || 38);
  selectLanguage.value = appSettings.language || "auto";
  selectProvider.value = appSettings.sttProvider || "auto";
}

btnSaveSettings.addEventListener("click", () => {
  appSettings.groqApiKey = inputGroqKey.value.trim();
  appSettings.openaiApiKey = inputOpenAIKey.value.trim();
  appSettings.geminiApiKey = inputGeminiKey.value.trim();
  appSettings.maxCpl = Math.max(15, parseInt(inputMaxCpl.value, 10) || 38);
  appSettings.language = selectLanguage.value as LanguageChoice;
  appSettings.sttProvider = selectProvider.value as SttProvider;

  saveSettings(appSettings);
  notify("Settings saved successfully!");
});

/* ==========================================================================
   Initialization
   ========================================================================== */
captionStatus.hidden = true;
populateSettingsUI();
setTyperOutputMode("unicode");
renderKeyboard();
renderTyper();
