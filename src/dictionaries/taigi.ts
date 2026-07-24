import type { Dictionary } from './dictionary';
import type { DictSearchResponse, DictionaryResult, Definition } from '../shared/types';

/** Raw JSON structure from dict-twblg.json */
export interface TaigiRawEntry {
    title: string;
    heteronyms: Array<{
        id: string;
        trs: string;
        reading?: string;
        definitions: Array<{
            type?: string;
            def: string;
            example?: string[];
        }>;
        synonyms?: string;
        antonyms?: string;
    }>;
}

const ANCHOR = '\uFFF9';
const SEPARATOR = '\uFFFA';
const TERMINATOR = '\uFFFB';

/** Parse a Taigi example sentence with special Unicode markers */
function parseExample(raw: string): { text: string; reading?: string; translation?: string } {
    const anchor = raw.indexOf(ANCHOR);
    const sep = raw.indexOf(SEPARATOR);
    const term = raw.indexOf(TERMINATOR);
    if (anchor === -1 || sep === -1 || term === -1) {
        // No structured markers — treat entire string as plain text
        return { text: raw.trim() };
    }
    return {
        text: raw.slice(anchor + 1, sep),
        reading: raw.slice(sep + 1, term),
        translation: raw.slice(term + 1).trim(),
    };
}

export const ID = 'taigi';
export const NAME = 'MoE Taiwanese Hokkien (台語)';

export class TaigiDictionary implements Dictionary {
    readonly id = ID;

    /** Map from headword (Chinese characters) to entries */
    private index: Map<string, TaigiRawEntry[]>;

    constructor(data: TaigiRawEntry[]) {
        this.index = new Map();
        for (const entry of data) {
            const existing = this.index.get(entry.title);
            if (existing) {
                existing.push(entry);
            } else {
                this.index.set(entry.title, [entry]);
            }
        }
    }

    search(text: string, maxResults: number = 7): DictSearchResponse | null {
        const entries: DictionaryResult[] = [];
        let maxLen = 0;
        let more = false;

        // Try matching progressively shorter prefixes
        const maxWord = Math.min(text.length, 10);
        for (let len = maxWord; len > 0; len--) {
            const word = text.substring(0, len);
            const rawEntries = this.index.get(word);
            if (!rawEntries) continue;

            if (maxLen === 0) maxLen = len;

            for (const rawEntry of rawEntries) {
                for (const het of rawEntry.heteronyms) {
                    if (entries.length >= maxResults) {
                        more = true;
                        break;
                    }

                    const definitions: Definition[] = het.definitions.map(d => {
                        const def: Definition = { def: d.def };
                        if (d.type) def.type = d.type;
                        if (d.example) {
                            def.examples = d.example.map(parseExample);
                        }
                        return def;
                    });

                    entries.push({
                        headword: rawEntry.title,
                        reading: het.trs,
                        definitions,
                        source: 'taigi',
                        readingType: het.reading,
                    });
                }
                if (more) break;
            }

            if (more) break;
        }

        if (entries.length === 0) return null;

        // Sort readings
        const readingOrder = { '白': 1, '文': 2, '替': 3, '俗': 4 };
        entries.sort((a, b) => {
          const rankA = a.readingType ? readingOrder[a.readingType] : -Infinity;
          const rankB = b.readingType ? readingOrder[b.readingType] : -Infinity;
          return rankA - rankB;
        });

        return { matchLen: maxLen, entries, more };
    }
}
