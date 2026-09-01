import "./styles.css";
import { unicodeToDlManel } from "sinhala-unicode-coverter";
import { PHONETIC_CATEGORIES, WIJESEKARA_ROWS, type PhoneticCategory } from "./core/keyboardLayouts";
import { unicodeToIsi } from "./core/isiConverter";
import { transliterate } from "./core/transliterator";
import { copyToHostClipboard, readFromHostClipboard } from "./platform/clipboard";
import { applySelectionEdit, deleteAtSelection, insertAtSelection } from "./ui/textInsertion";

type OutputMode = "unicode" | "wije" | "isi";
type KeyboardLayout = "easy" | "wije";

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const input = $("#singlish") as HTMLTextAreaElement;
const output = $("#sinhala") as HTMLTextAreaElement;
const message = $("#message");
const count = $("#count");
const copyButton = $("#copy") as HTMLButtonElement;
const unicodeModeButton = $("#mode-unicode") as HTMLButtonElement;
const wijeModeButton = $("#mode-wije") as HTMLButtonElement;
const isiModeButton = $("#mode-isi") as HTMLButtonElement;
const keyboardToggle = $("#keyboard-toggle") as HTMLButtonElement;
const hintsToggle = $("#hints-toggle") as HTMLButtonElement;
const keyboardPanel = $("#keyboard-panel");
const hintsPanel = $("#hints-panel");
const keyboardKeys = $("#keyboard-keys");
const keyboardFilters = $("#keyboard-filters");
const easyLayoutButton = $("#layout-easy") as HTMLButtonElement;
const wijeLayoutButton = $("#layout-wije") as HTMLButtonElement;

let unicodeOutput = "";
let outputMode: OutputMode = "unicode";
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

function clipboardValue(): string {
  if (outputMode === "wije") return unicodeToDlManel(unicodeOutput);
  if (outputMode === "isi") return unicodeToIsi(unicodeOutput);
  return unicodeOutput;
}

function render(): void {
  unicodeOutput = transliterate(input.value);
  // Keep a readable Unicode preview in all modes. Wije and ISI are legacy
  // clipboard encodings and only render correctly after their font is applied.
  output.value = unicodeOutput;
  count.textContent = `${Array.from(unicodeOutput).length} characters`;
}

function notify(text: string, error = false): void {
  message.textContent = text;
  message.classList.toggle("error", error);
  window.setTimeout(() => {
    if (message.textContent === text) message.textContent = "";
  }, 2600);
}

function setOutputMode(mode: OutputMode): void {
  outputMode = mode;
  unicodeModeButton.classList.toggle("active", mode === "unicode");
  wijeModeButton.classList.toggle("active", mode === "wije");
  isiModeButton.classList.toggle("active", mode === "isi");
  unicodeModeButton.setAttribute("aria-pressed", String(mode === "unicode"));
  wijeModeButton.setAttribute("aria-pressed", String(mode === "wije"));
  isiModeButton.setAttribute("aria-pressed", String(mode === "isi"));
  copyButton.textContent = OUTPUT_DETAILS[mode].copy;
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

function insertIntoInput(value: string): void {
  applySelectionEdit(input, insertAtSelection(input.value, input.selectionStart, input.selectionEnd, value));
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
    keyboardKeys.appendChild(addKeyButton(item.output, item.label ?? item.token, () => insertIntoInput(item.token)));
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
      rowElement.appendChild(addKeyButton(value, wijeShifted ? item.physical.toUpperCase() : item.physical, () => insertIntoInput(value)));
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
  actions.appendChild(addKeyButton("Space", "space", () => insertIntoInput(" "), true));
  actions.appendChild(addKeyButton("\u232B", "backspace", () => {
    applySelectionEdit(input, deleteAtSelection(input.value, input.selectionStart, input.selectionEnd));
  }, true));
  actions.appendChild(addKeyButton("\u21B5", "enter", () => insertIntoInput("\n"), true));
  keyboardKeys.appendChild(actions);
  $("#keyboard-caption").textContent = "SLS Wijesekara keys insert Sinhala Unicode directly.";
}

function renderKeyboard(): void {
  const easy = keyboardLayout === "easy";
  easyLayoutButton.classList.toggle("active", easy);
  wijeLayoutButton.classList.toggle("active", !easy);
  easyLayoutButton.setAttribute("aria-selected", String(easy));
  wijeLayoutButton.setAttribute("aria-selected", String(!easy));
  if (easy) renderPhoneticKeyboard();
  else renderWijesekaraKeyboard();
}

input.addEventListener("input", render);

unicodeModeButton.addEventListener("click", () => setOutputMode("unicode"));
wijeModeButton.addEventListener("click", () => setOutputMode("wije"));
isiModeButton.addEventListener("click", () => setOutputMode("isi"));
keyboardToggle.addEventListener("click", () => setToolPanel("keyboard", keyboardPanel.hidden));
hintsToggle.addEventListener("click", () => setToolPanel("hints", hintsPanel.hidden));
easyLayoutButton.addEventListener("click", () => { keyboardLayout = "easy"; renderKeyboard(); });
wijeLayoutButton.addEventListener("click", () => { keyboardLayout = "wije"; renderKeyboard(); });

copyButton.addEventListener("click", async () => {
  if (!unicodeOutput) return notify("Type some Singlish first.", true);
  try {
    const value = clipboardValue();
    if (!copyToHostClipboard(value)) await navigator.clipboard.writeText(value);
    notify(OUTPUT_DETAILS[outputMode].copied);
  } catch {
    notify("Unable to access the clipboard.", true);
  }
});

output.addEventListener("copy", (event) => {
  event.preventDefault();
  const value = clipboardValue();
  if (!copyToHostClipboard(value)) event.clipboardData?.setData("text/plain", value);
  notify(OUTPUT_DETAILS[outputMode].copied);
});

$("#paste").addEventListener("click", async () => {
  try {
    input.value = readFromHostClipboard() ?? await navigator.clipboard.readText();
    render();
    input.focus();
  } catch {
    input.focus();
    notify("Press Ctrl+V to paste into the Singlish field.", true);
  }
});

setOutputMode("unicode");
renderKeyboard();
render();
