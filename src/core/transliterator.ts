export interface TransliterationOptions {
  dictionary?: Record<string, string>;
  preserveEnglish?: boolean;
  preserveCommonEnglishWords?: boolean;
  customEnglishWords?: string[];
}

import { SINHALA_UNICODE as U } from "./unicodeMapping";

/**
 * Curated list of common English loanwords, technical terms, and creator vocabulary
 * frequently typed alongside Sinhala in video editing and social media.
 */
export const COMMON_ENGLISH_WORDS = new Set<string>([
  // Social Media & Web Platforms
  "youtube", "facebook", "instagram", "tiktok", "whatsapp", "twitter", "telegram",
  "google", "gmail", "email", "chatgpt", "ai", "app", "website", "web", "online",
  "internet", "wifi", "link", "post", "story", "reels", "shorts", "page", "group",
  "account", "profile", "channel", "subscribe", "subscribers", "subscriber", "sub",
  "like", "likes", "comment", "comments", "share", "view", "views", "follower",
  "followers", "bell", "icon", "notification", "notifications", "creator", "feed",
  // Video & Audio Production
  "audio", "clip", "clips", "sound", "music", "voice", "mic", "microphone",
  "camera", "lens", "zoom", "photo", "image", "pic", "picture", "screen", "record", "recording",
  "edit", "editing", "editor", "cut", "trim", "render", "rendering", "export", "exporting",
  "import", "importing", "timeline", "track", "layer", "effect", "effects", "transition",
  "transitions", "preset", "presets", "mogrt", "template", "templates", "title", "titles",
  "caption", "captions", "subtitle", "subtitles", "font", "fonts", "color", "colour",
  "grade", "grading", "lut", "luts", "intro", "outro", "logo", "banner", "thumbnail",
  "thumbnails", "vlog", "vlogger", "stream", "streaming", "live", "fps", "resolution",
  "sync", "frame", "frames", "playback", "sequence", "project", "file", "files",
  // Software & Hardware
  "premiere", "photoshop", "aftereffects", "illustrator", "audition", "davinci", "capcut",
  "pc", "laptop", "computer", "mac", "windows", "drive", "folder", "folders", "storage",
  "ssd", "ram", "cpu", "gpu", "battery", "charger", "phone", "mobile", "display",
  "monitor", "keyboard", "mouse", "headphone", "headphones", "earbuds", "speaker",
  "bluetooth", "usb", "device", "setup",
  // Creator Common Speech & Expressions
  "hello", "hi", "hey", "welcome", "bye", "okay", "ok", "cool", "super", "good",
  "bad", "best", "top", "new", "update", "updates", "tutorial", "tutorials", "guide",
  "tips", "tricks", "review", "unboxing", "challenge", "part", "episode", "season",
  "series", "class", "course", "lesson", "exam", "test", "office", "work", "job",
  "company", "business", "call", "message", "sms", "number", "price", "cost", "free",
  "discount", "offer", "shop", "store", "buy", "sell", "order", "delivery", "cash",
  "card", "payment", "bank", "pass", "fail", "winner", "win", "game", "gaming",
  "play", "player", "match", "team", "club", "party", "event", "birthday", "friend",
  "friends", "family", "doctor", "hospital", "school", "campus", "university",
  "check", "click", "download", "upload", "join", "start", "stop", "next", "done"
]);

const WORDS: Record<string, string> = {
  mama: "මම", ada: "අද", api: "අපි", oya: "ඔයා", oyaa: "ඔයා", oyata: "ඔයාට",
  gedara: "ගෙදර", heta: "හෙට", kohomada: "කොහොමද", kohomadha: "කොහොමද",
  yanawa: "යනවා", yanava: "යනවා", enawa: "එනවා", venawa: "වෙනවා", wenawa: "වෙනවා",
  karanawa: "කරනවා", karanava: "කරනවා", karanne: "කරන්නේ", karanna: "කරන්න",
  mokada: "මොකද", mokakda: "මොකක්ද", mokadda: "මොකද්ද", ehema: "එහෙම", mehema: "මෙහෙම",
  apita: "අපිට", eka: "එක", meka: "මේක", kiyanawa: "කියනවා", kathaa: "කතා",
  loku: "ලොකු", wadak: "වැඩක්", gana: "ගැන", hari: "හරි", yamu: "යමු", aluth: "අලුත්",
  video: "වීඩියෝ", release: "රිලීස්", use: "යූස්", kiyatada: "කීයටද", patan: "පටන්", ganne: "ගන්නේ"
};

const PHONETIC_WORDS: Record<string, string> = {
  nnda: "\u0DAC",
  nndha: "\u0DB3",
  nnga: "\u0D9F",
  q: "\u0D9F"
};

const CASE_SENSITIVE_WORDS: Record<string, string> = {
  aN: "\u0D85\u0D82",
  aH: "\u0D85\u0D83",
  RR: U.vowels.vocalicRR,
  LR: U.vowels.vocalicL,
  LRR: U.vowels.vocalicLL
};

const INDEPENDENT: Record<string, string> = {
  a: U.vowels.a,
  aa: U.vowels.aa,
  ae: U.vowels.ae,
  aae: U.vowels.aae,
  i: U.vowels.i,
  ii: U.vowels.ii,
  u: U.vowels.u,
  uu: U.vowels.uu,
  e: U.vowels.e,
  ee: U.vowels.ee,
  ai: U.vowels.ai,
  o: U.vowels.o,
  oo: U.vowels.oo,
  au: U.vowels.au,
  A: U.vowels.ae,
  Aa: U.vowels.aae,
  I: U.vowels.ai,
  ie: U.vowels.ii,
  ea: U.vowels.ee,
  ei: U.vowels.ee,
  oe: U.vowels.oo,
  R: U.vowels.vocalicR,
  RR: U.vowels.vocalicRR,
  LR: U.vowels.vocalicL,
  LRR: U.vowels.vocalicLL
};

const VOWEL_SIGNS: Record<string, string> = {
  a: "",
  aa: U.signs.aa,
  ae: U.signs.ae,
  aae: U.signs.aae,
  i: U.signs.i,
  ii: U.signs.ii,
  u: U.signs.u,
  uu: U.signs.uu,
  e: U.signs.e,
  ee: U.signs.ee,
  ai: U.signs.ai,
  o: U.signs.o,
  oo: U.signs.oo,
  au: U.signs.au,
  A: U.signs.ae,
  Aa: U.signs.aae,
  I: U.signs.ai,
  ie: U.signs.ii,
  ea: U.signs.ee,
  ei: U.signs.ee,
  oe: U.signs.oo,
  R: U.signs.vocalicR,
  RR: U.signs.vocalicRR,
  LR: U.signs.vocalicL,
  LRR: U.signs.vocalicLL
};

const CONSONANTS: Record<string, string> = {
  ...U.consonants,
  G: U.consonants.gh,
  Ch: U.consonants.chh,
  T: U.consonants.tth,
  D: U.consonants.ddh,
  Th: U.consonants.thh,
  Dh: U.consonants.dhh,
  N: U.consonants.nn,
  B: U.consonants.mb,
  Sh: U.consonants.ssh,
  L: U.consonants.ll,
  GN: U.consonants.gn,
  KN: U.consonants.ny
};

const vowels = Object.keys(INDEPENDENT).sort((a, b) => b.length - a.length);
const consonants = Object.keys(CONSONANTS).sort((a, b) => b.length - a.length);
const caseConsonants = ["GN", "KN", "Ch", "Th", "Dh", "Sh", "G", "T", "D", "N", "B", "L"];
const allCapsToken = /^[A-Z]{2,}$/;
const titleCaseToken = /^[A-Z][a-z]+(?:['-][A-Za-z]+)*$/;

/**
 * Recognizes CamelCase and PascalCase English words with interior capitals
 * (e.g. YouTube, ChatGPT, AutoCap, TikTok, iPhone, WhatsApp, PremierePro).
 * Guarantees length >= 4 and avoids 2-3 char Sinhala vowel/cluster aliases (kA, krA, kYa, etc.).
 */
function isMixedCaseEnglishWord(word: string): boolean {
  if (word.length < 4) return false;
  const hasCamelPattern =
    /^[a-z]+[A-Z][A-Za-z0-9]+$/.test(word) ||
    /^[A-Z][a-z]+[A-Z][A-Za-z0-9]*$/.test(word) ||
    /^[A-Z]{2,}[a-z]+[A-Z0-9]*$/.test(word);
  if (!hasCamelPattern) return false;
  if (/[a-z](?:A|Aa|I|R|RR|LR|LRR)$/.test(word)) return false;
  return true;
}

const zeroWidthJoiner = "\u200D";

function matchAt(input: string, index: number, candidates: string[]): string | undefined {
  return candidates.find((candidate) => input.startsWith(candidate, index));
}

function isCaseAliasSyllable(word: string): boolean {
  if (["A", "Aa", "I", "R", "RR", "LR", "LRR"].includes(word)) return true;
  const consonant = matchAt(word, 0, caseConsonants);
  if (!consonant) return false;
  const remainder = word.slice(consonant.length);
  return remainder === "" || Object.prototype.hasOwnProperty.call(VOWEL_SIGNS, remainder);
}

function phoneticWord(word: string): string {
  const input = word;
  let output = "";
  let i = 0;
  while (i < input.length) {
    const consonant = matchAt(input, i, consonants);
    if (consonant) {
      i += consonant.length;

      if (input.startsWith("ruu", i)) {
        output += CONSONANTS[consonant] + U.signs.vocalicRR;
        i += 3;
        continue;
      }
      if (input.startsWith("ru", i)) {
        output += CONSONANTS[consonant] + U.signs.vocalicR;
        i += 2;
        continue;
      }

      if (input[i] === "r" || input[i] === "Y") {
        const clusterConsonant = input[i] === "r" ? U.consonants.r : U.consonants.y;
        output += CONSONANTS[consonant] + U.signs.virama + zeroWidthJoiner + clusterConsonant;
        i += 1;
        const clusterVowel = matchAt(input, i, vowels);
        if (clusterVowel) {
          output += VOWEL_SIGNS[clusterVowel];
          i += clusterVowel.length;
        } else {
          const nextConsonant = matchAt(input, i, consonants);
          if (nextConsonant || i === input.length) output += U.signs.virama;
        }
        continue;
      }

      const vowel = matchAt(input, i, vowels);
      if (vowel) {
        output += CONSONANTS[consonant] + VOWEL_SIGNS[vowel];
        i += vowel.length;
      } else {
        const nextConsonant = matchAt(input, i, consonants);
        output += CONSONANTS[consonant] + (nextConsonant || i === input.length ? U.signs.virama : "");
      }
      continue;
    }
    const vowel = matchAt(input, i, vowels);
    if (vowel) {
      output += INDEPENDENT[vowel];
      i += vowel.length;
      continue;
    }
    // Common Singlish uses x for the anusvara. This allows spellings such as
    // "axka" to produce "අංක" without leaving a literal x in Sinhala text.
    if (input[i] === "x") {
      output += U.signs.anusvara;
      i += 1;
      continue;
    }
    output += input[i++];
  }
  return output;
}

function convertPlainWord(
  word: string,
  dictionary: Record<string, string>,
  preserveEnglish: boolean,
  commonEnglishWords?: Set<string>,
  customEnglishWords?: Set<string>
): string {
  const key = word.toLowerCase();
  if (CASE_SENSITIVE_WORDS[word]) return CASE_SENSITIVE_WORDS[word];
  if (isCaseAliasSyllable(word)) return phoneticWord(word);
  if (preserveEnglish && (allCapsToken.test(word) || isMixedCaseEnglishWord(word))) return word;
  if (customEnglishWords?.has(key)) return word;
  if (dictionary[key]) return dictionary[key];
  if (preserveEnglish && commonEnglishWords?.has(key)) return word;
  if (preserveEnglish && titleCaseToken.test(word)) return word;
  if (!preserveEnglish && (allCapsToken.test(word) || titleCaseToken.test(word) || isMixedCaseEnglishWord(word))) {
    return phoneticWord(key);
  }
  return phoneticWord(word);
}

export function transliterate(input: string, options: TransliterationOptions = {}): string {
  const dictionary = { ...WORDS, ...PHONETIC_WORDS, ...(options.dictionary ?? {}) };
  const preserveEnglish = options.preserveEnglish ?? true;
  const preserveCommonEnglish = options.preserveCommonEnglishWords ?? true;
  const customEnglishWords =
    options.customEnglishWords && options.customEnglishWords.length > 0
      ? new Set(options.customEnglishWords.map((w) => w.toLowerCase().trim()).filter(Boolean))
      : undefined;
  const commonEnglishWords = preserveCommonEnglish ? COMMON_ENGLISH_WORDS : undefined;

  const locked: string[] = [];
  const protect = (value: string) => `\uE000${locked.push(value) - 1}\uE001`;
  const safe = input
    // Delimiters for explicit English word/phrase preservation
    .replace(/\{([^{}\n]+)\}/g, (_, value: string) => protect(value))
    .replace(/`([^`\n]+)`/g, (_, value: string) => protect(value))
    .replace(/\[([^[\]\n]+)\]/g, (_, value: string) => protect(value))
    .replace(/"([^"\n]+)"/g, (_, value: string) => protect(`"${value}"`))
    .replace(/(^|[\s(])'([^'\n]+)'(?=$|[\s),.!?])/g, (_, prefix: string, value: string) => `${prefix}${protect(`'${value}'`)}`)
    // Special Sinhala escapes
    .replace(/a\\n/g, () => protect("\u0D85\u0D82"))
    .replace(/a\\h/g, () => protect("\u0D85\u0D83"))
    .replace(/\\N/g, () => protect(U.consonants.nng))
    .replace(/\\R/g, () => protect("\u0D8D"))
    .replace(/\\r(?=[A-Za-z])/g, () => protect(U.consonants.r + U.signs.virama + zeroWidthJoiner))
    // Explicit backslash escaped single word (e.g. \video -> video)
    .replace(/\\([A-Za-z]+)/g, (_, value: string) => protect(value))
    .replace(/https?:\/\/[^\s\uE000]+|www\.[^\s\uE000]+|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\b(?:\d+[A-Za-z]+|[A-Za-z]+\d+[A-Za-z0-9]*)\b/g, protect);

  const result = safe.replace(/[A-Za-z]+(?:['-][A-Za-z]+)*|\uE000\d+\uE001/g, (token) => {
    const lock = token.match(/^\uE000(\d+)\uE001$/);
    return lock
      ? locked[Number(lock[1])]
      : convertPlainWord(token, dictionary, preserveEnglish, commonEnglishWords, customEnglishWords);
  });
  return result.normalize("NFC");
}

export const coreDictionary = Object.freeze({ ...WORDS, ...PHONETIC_WORDS });
