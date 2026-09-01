export interface PhoneticKey {
  id: string;
  token: string;
  output: string;
  label?: string;
}

export interface PhoneticCategory {
  id: "quick" | "vowels" | "consonants" | "combinations" | "symbols";
  label: string;
  keys: readonly PhoneticKey[];
}

const key = (id: string, token: string, output: string, label?: string): PhoneticKey => ({ id, token, output, label });

export const PHONETIC_CATEGORIES: readonly PhoneticCategory[] = [
  {
    id: "quick",
    label: "Quick",
    keys: [
      key("quick-k", "k", "\u0D9A\u0DCA"), key("quick-ka", "ka", "\u0D9A"),
      key("quick-kaa", "kaa", "\u0D9A\u0DCF"), key("quick-kA", "kA", "\u0D9A\u0DD0"),
      key("quick-kAa", "kAa", "\u0D9A\u0DD1"), key("quick-ki", "ki", "\u0D9A\u0DD2"),
      key("quick-kie", "kie", "\u0D9A\u0DD3"), key("quick-ku", "ku", "\u0D9A\u0DD4"),
      key("quick-kuu", "kuu", "\u0D9A\u0DD6"), key("quick-ke", "ke", "\u0D9A\u0DD9"),
      key("quick-kei", "kei", "\u0D9A\u0DDA"), key("quick-kI", "kI", "\u0D9A\u0DDB"),
      key("quick-ko", "ko", "\u0D9A\u0DDC"), key("quick-koe", "koe", "\u0D9A\u0DDD"),
      key("quick-kau", "kau", "\u0D9A\u0DDE")
    ]
  },
  {
    id: "vowels",
    label: "Vowels",
    keys: [
      key("vowel-a", "a", "\u0D85"), key("vowel-aa", "aa", "\u0D86"),
      key("vowel-A", "A", "\u0D87"), key("vowel-Aa", "Aa", "\u0D88"),
      key("vowel-i", "i", "\u0D89"), key("vowel-ie", "ie", "\u0D8A"),
      key("vowel-u", "u", "\u0D8B"), key("vowel-uu", "uu", "\u0D8C"),
      key("vowel-R", "R", "\u0D8D"), key("vowel-RR", "RR", "\u0D8E"),
      key("vowel-LR", "LR", "\u0D8F"), key("vowel-LRR", "LRR", "\u0D90"),
      key("vowel-e", "e", "\u0D91"), key("vowel-ei", "ei", "\u0D92"),
      key("vowel-I", "I", "\u0D93"), key("vowel-o", "o", "\u0D94"),
      key("vowel-oe", "oe", "\u0D95"), key("vowel-au", "au", "\u0D96")
    ]
  },
  {
    id: "consonants",
    label: "Alphabet",
    keys: [
      key("letter-ka", "ka", "\u0D9A"), key("letter-kha", "kha", "\u0D9B"),
      key("letter-ga", "ga", "\u0D9C"), key("letter-Ga", "Ga", "\u0D9D"),
      key("letter-nga", "\\N", "\u0D9E"), key("letter-nnga", "q", "\u0D9F"),
      key("letter-cha", "cha", "\u0DA0"), key("letter-Cha", "Cha", "\u0DA1"),
      key("letter-ja", "ja", "\u0DA2"), key("letter-jha", "jha", "\u0DA3"),
      key("letter-nya", "KNa", "\u0DA4"), key("letter-gna", "GNa", "\u0DA5"),
      key("letter-nja", "nja", "\u0DA6"), key("letter-ta", "ta", "\u0DA7"),
      key("letter-Ta", "Ta", "\u0DA8"), key("letter-da", "da", "\u0DA9"),
      key("letter-Da", "Da", "\u0DAA"), key("letter-Na", "Na", "\u0DAB"),
      key("letter-nnda", "nnda", "\u0DAC"), key("letter-tha", "tha", "\u0DAD"),
      key("letter-Tha", "Tha", "\u0DAE"), key("letter-dha", "dha", "\u0DAF"),
      key("letter-Dha", "Dha", "\u0DB0"), key("letter-na", "na", "\u0DB1"),
      key("letter-nndha", "nndha", "\u0DB3"), key("letter-pa", "pa", "\u0DB4"),
      key("letter-pha", "pha", "\u0DB5"), key("letter-ba", "ba", "\u0DB6"),
      key("letter-bha", "bha", "\u0DB7"), key("letter-ma", "ma", "\u0DB8"),
      key("letter-Ba", "Ba", "\u0DB9"), key("letter-ya", "ya", "\u0DBA"),
      key("letter-ra", "ra", "\u0DBB"), key("letter-la", "la", "\u0DBD"),
      key("letter-wa", "wa", "\u0DC0"), key("letter-sha", "sha", "\u0DC1"),
      key("letter-Sha", "Sha", "\u0DC2"), key("letter-sa", "sa", "\u0DC3"),
      key("letter-ha", "ha", "\u0DC4"), key("letter-La", "La", "\u0DC5"),
      key("letter-fa", "fa", "\u0DC6")
    ]
  },
  {
    id: "combinations",
    label: "Combinations",
    keys: [
      key("combo-kra", "kra", "\u0D9A\u0DCA\u200D\u0DBB"),
      key("combo-kraa", "kraa", "\u0D9A\u0DCA\u200D\u0DBB\u0DCF"),
      key("combo-krA", "krA", "\u0D9A\u0DCA\u200D\u0DBB\u0DD0"),
      key("combo-krAa", "krAa", "\u0D9A\u0DCA\u200D\u0DBB\u0DD1"),
      key("combo-kri", "kri", "\u0D9A\u0DCA\u200D\u0DBB\u0DD2"),
      key("combo-krie", "krie", "\u0D9A\u0DCA\u200D\u0DBB\u0DD3"),
      key("combo-kru", "kru", "\u0D9A\u0DD8"), key("combo-kruu", "kruu", "\u0D9A\u0DF2"),
      key("combo-kre", "kre", "\u0D9A\u0DCA\u200D\u0DBB\u0DD9"),
      key("combo-krei", "krei", "\u0D9A\u0DCA\u200D\u0DBB\u0DDA"),
      key("combo-kro", "kro", "\u0D9A\u0DCA\u200D\u0DBB\u0DDC"),
      key("combo-kroe", "kroe", "\u0D9A\u0DCA\u200D\u0DBB\u0DDD"),
      key("combo-kYa", "kYa", "\u0D9A\u0DCA\u200D\u0DBA"),
      key("combo-repaya", "\\rka", "\u0DBB\u0DCA\u200D\u0D9A")
    ]
  },
  {
    id: "symbols",
    label: "Signs",
    keys: [
      key("sign-anusvara", "x", "\u0D82", "Anusvara"),
      key("letter-anusvara", "aN", "\u0D85\u0D82"), key("sign-visarga", "aH", "\u0D85\u0D83"),
      key("sign-candrabindu", "\u0D81", "\u0D81", "Candrabindu"), key("sign-kunddaliya", "\u0DF4", "\u0DF4", "Kunddaliya"),
      key("digit-0", "\u0DE6", "\u0DE6"), key("digit-1", "\u0DE7", "\u0DE7"),
      key("digit-2", "\u0DE8", "\u0DE8"), key("digit-3", "\u0DE9", "\u0DE9"),
      key("digit-4", "\u0DEA", "\u0DEA"), key("digit-5", "\u0DEB", "\u0DEB"),
      key("digit-6", "\u0DEC", "\u0DEC"), key("digit-7", "\u0DED", "\u0DED"),
      key("digit-8", "\u0DEE", "\u0DEE"), key("digit-9", "\u0DEF", "\u0DEF")
    ]
  }
] as const;

export interface WijesekaraKey {
  id: string;
  physical: string;
  normal: string;
  shifted: string;
}

const wije = (id: string, physical: string, normal: string, shifted = ""): WijesekaraKey => ({ id, physical, normal, shifted });

/** SLS 1134 Wijesekara arrangement, grouped by physical keyboard row. */
export const WIJESEKARA_ROWS: readonly (readonly WijesekaraKey[])[] = [
  [
    wije("wq", "q", "\u0DD4", "\u0DD6"), wije("ww", "w", "\u0D85", "\u0D8B"),
    wije("we", "e", "\u0DD0", "\u0DD1"), wije("wr", "r", "\u0DBB", "\u0D8D"),
    wije("wt", "t", "\u0D91", "\u0D94"), wije("wy", "y", "\u0DC4", "\u0DC1"),
    wije("wu", "u", "\u0DB8", "\u0DB9"), wije("wi", "i", "\u0DC3", "\u0DC2"),
    wije("wo", "o", "\u0DAF", "\u0DB0"), wije("wp", "p", "\u0DA0", "\u0DA1"),
    wije("wbracket-left", "[", "\u0DA4", "\u0DA5"), wije("wbracket-right", "]", ";", ":")
  ],
  [
    wije("wa", "a", "\u0DCA", "\u0DDF"), wije("ws", "s", "\u0DD2", "\u0DD3"),
    wije("wd", "d", "\u0DCF", "\u0DD8"), wije("wf", "f", "\u0DD9", "\u0DC6"),
    wije("wg", "g", "\u0DA7", "\u0DA8"), wije("wh", "h", "\u0DBA", "\u0DCA\u200D\u0DBA"),
    wije("wj", "j", "\u0DC0", "\u0DC5\u0DD4"), wije("wk", "k", "\u0DB1", "\u0DAB"),
    wije("wl", "l", "\u0D9A", "\u0D9B"), wije("wsemicolon", ";", "\u0DAD", "\u0DAE"),
    wije("wquote", "'", ".", ",")
  ],
  [
    wije("wz", "z", "'", "\"") , wije("wx", "x", "\u0D82", "\u0D83"),
    wije("wc", "c", "\u0DA2", "\u0DA3"), wije("wv", "v", "\u0DA9", "\u0DAA"),
    wije("wb", "b", "\u0D89", "\u0D8A"), wije("wn", "n", "\u0DB6", "\u0DB7"),
    wije("wm", "m", "\u0DB4", "\u0DB5"), wije("wcomma", ",", "\u0DBD", "\u0DC5"),
    wije("wperiod", ".", "\u0D9C", "\u0D9D"), wije("wslash", "/", "/", "?")
  ]
] as const;
