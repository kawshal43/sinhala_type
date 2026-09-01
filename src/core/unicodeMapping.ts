/** Official Sinhala Unicode block mappings (U+0D80–U+0DFF). */
export const SINHALA_UNICODE = Object.freeze({
  vowels: {
    a: "\u0D85", aa: "\u0D86", ae: "\u0D87", aae: "\u0D88",
    i: "\u0D89", ii: "\u0D8A", u: "\u0D8B", uu: "\u0D8C",
    vocalicR: "\u0D8D", vocalicRR: "\u0D8E", vocalicL: "\u0D8F", vocalicLL: "\u0D90",
    e: "\u0D91", ee: "\u0D92", ai: "\u0D93", o: "\u0D94",
    oo: "\u0D95", au: "\u0D96"
  },
  consonants: {
    k: "\u0D9A", kh: "\u0D9B", g: "\u0D9C", gh: "\u0D9D", nng: "\u0D9E", ng: "\u0D9F",
    ch: "\u0DA0", chh: "\u0DA1", j: "\u0DA2", jh: "\u0DA3", ny: "\u0DA4", gn: "\u0DA5", nj: "\u0DA6",
    t: "\u0DA7", tth: "\u0DA8", d: "\u0DA9", ddh: "\u0DAA", nn: "\u0DAB", nnd: "\u0DAC",
    th: "\u0DAD", thh: "\u0DAE", dh: "\u0DAF", dhh: "\u0DB0", n: "\u0DB1", ndh: "\u0DB3",
    p: "\u0DB4", ph: "\u0DB5", b: "\u0DB6", bh: "\u0DB7", m: "\u0DB8", mb: "\u0DB9",
    y: "\u0DBA", r: "\u0DBB", l: "\u0DBD", w: "\u0DC0", v: "\u0DC0",
    sh: "\u0DC1", ssh: "\u0DC2", s: "\u0DC3", h: "\u0DC4", ll: "\u0DC5", f: "\u0DC6"
  },
  signs: {
    virama: "\u0DCA", aa: "\u0DCF", ae: "\u0DD0", aae: "\u0DD1",
    i: "\u0DD2", ii: "\u0DD3", u: "\u0DD4", uu: "\u0DD6",
    vocalicR: "\u0DD8", vocalicRR: "\u0DF2", vocalicL: "\u0DDF", vocalicLL: "\u0DF3",
    e: "\u0DD9", ee: "\u0DDA", ai: "\u0DDB", o: "\u0DDC",
    oo: "\u0DDD", au: "\u0DDE", candrabindu: "\u0D81", anusvara: "\u0D82", visarga: "\u0D83"
  }
} as const);

/** Every assigned independent vowel and consonant in the Sinhala Unicode alphabet. */
export const SINHALA_ALPHABET = Object.freeze([
  ...new Set(Object.values(SINHALA_UNICODE.vowels)),
  ...new Set(Object.values(SINHALA_UNICODE.consonants))
]);

export function isSinhalaUnicodeCharacter(character: string): boolean {
  const point = character.codePointAt(0);
  return point !== undefined && point >= 0x0d80 && point <= 0x0dff;
}

export function unicodeCodePoints(value: string): string[] {
  return Array.from(value, (character) => `U+${character.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`);
}
