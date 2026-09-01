import mappingData from "./isiMapping.json";

type IsiMappingEntry = { uni: string; isi: string };

const unicodeToIsiMap = new Map<string, string>(
  (mappingData as IsiMappingEntry[]).map(({ uni, isi }) => [uni.normalize("NFC"), isi])
);

const longestUnicodeSequence = Math.max(
  1,
  ...Array.from(unicodeToIsiMap.keys(), (value) => value.length)
);

/** Convert Sinhala Unicode to the legacy ISI/Isiwara (Island) font encoding. */
export function unicodeToIsi(value: string): string {
  const input = value.normalize("NFC");
  let result = "";
  let index = 0;

  while (index < input.length) {
    let matchLength = Math.min(longestUnicodeSequence, input.length - index);
    let replacement: string | undefined;

    while (matchLength > 0) {
      replacement = unicodeToIsiMap.get(input.slice(index, index + matchLength));
      if (replacement !== undefined) break;
      matchLength -= 1;
    }

    if (replacement === undefined) {
      const codePoint = input.codePointAt(index)!;
      result += String.fromCodePoint(codePoint);
      index += codePoint > 0xffff ? 2 : 1;
    } else {
      result += replacement;
      index += matchLength;
    }
  }

  return result;
}

export const isiMappingSize = unicodeToIsiMap.size;
