/**
 * Dynamic CC-CEDICT dictionary loader.
 *
 * Strategy:
 * 1. Check IndexedDB for a cached dictionary + index.
 * 2. If cached data exists and is recent enough, use it.
 * 3. Otherwise, download the latest CEDICT from MDBG, build the index,
 *    store both in IndexedDB, and return them.
 * 4. If download fails, fall back to the bundled data shipped with the extension.
 * 5. User can manually trigger a refresh from the options page.
 */

import { CedictDictionary } from './cedict';

const CEDICT_URL = 'https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz';
const DB_NAME = 'zhongwen-dict';
const DB_VERSION = 1;
const STORE_NAME = 'cedict';
/** How often to auto-refresh the dictionary (7 days in ms) */
const UPDATE_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

export interface DictData {
    wordDict: string;
    wordIndex: string;
    grammarKeywords: Record<string, boolean>;
    vocabKeywords: Record<string, boolean>;
}

/** Status info about the cached dictionary, for display on the options page */
export interface DictStatus {
    /** Whether a downloaded dictionary is cached in IndexedDB */
    hasCachedDict: boolean;
    /** Timestamp of when the cached dictionary was downloaded (ms since epoch) */
    cachedTimestamp: number | null;
    /** Number of entries in the cached dictionary (approximate, based on index line count) */
    entryCount: number | null;
}

interface CachedDict {
    id: string;
    wordDict: string;
    wordIndex: string;
    timestamp: number;
}

const logMessage = (...args) => console.log('[Zhongwen]', ...args);
const logWarn = (...args) => console.warn('[Zhongwen]', ...args);

// --- IndexedDB helpers ---

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function getFromDB(db: IDBDatabase): Promise<CachedDict | undefined> {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.get('cedict');
        request.onsuccess = () => resolve(request.result as CachedDict | undefined);
        request.onerror = () => reject(request.error);
    });
}

function putInDB(db: IDBDatabase, data: CachedDict): Promise<void> {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.put(data);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// --- Index builder ---

/**
 * Builds a lookup index from raw CEDICT text.
 * Each line of the index is: word,offset1,offset2,...
 * where word is the simplified (or traditional) headword and offsets are
 * character positions in the dictionary string pointing to the start of entry lines.
 *
 * Both traditional and simplified forms are indexed.
 */
function buildIndex(dictText: string): string {
    const indexMap: Map<string, number[]> = new Map();
    const lines = dictText.split('\n');
    let offset = 0;

    for (const line of lines) {
        if (line && !line.startsWith('#')) {
            // CEDICT format: traditional simplified [pinyin] /def1/def2/.../
            const match = line.match(/^(\S+)\s+(\S+)\s+/);
            if (match) {
                const traditional = match[1];
                const simplified = match[2];

                // Index the simplified form
                const simpOffsets = indexMap.get(simplified);
                if (simpOffsets) {
                    simpOffsets.push(offset);
                } else {
                    indexMap.set(simplified, [offset]);
                }

                // Index the traditional form (if different from simplified)
                if (traditional !== simplified) {
                    const tradOffsets = indexMap.get(traditional);
                    if (tradOffsets) {
                        tradOffsets.push(offset);
                    } else {
                        indexMap.set(traditional, [offset]);
                    }
                }
            }
        }
        offset += line.length + 1; // +1 for the newline character
    }

    // Build sorted index text (sorted by key for binary search)
    const entries: string[] = [];
    const sortedKeys = [...indexMap.keys()].sort();
    for (const key of sortedKeys) {
        entries.push(key + ',' + indexMap.get(key)!.join(','));
    }
    return entries.join('\n');
}

// --- Download and decompress ---

async function downloadCEDICT(): Promise<string> {
    const response = await fetch(CEDICT_URL);
    if (!response.ok) {
        throw new Error(`Failed to download CEDICT: ${response.status} ${response.statusText}`);
    }

    const compressedData = await response.arrayBuffer();

    // Decompress gzip using DecompressionStream (available in modern browsers)
    const ds = new DecompressionStream('gzip');
    const decompressedStream = new Response(
        new Blob([compressedData]).stream().pipeThrough(ds)
    ).text();

    return decompressedStream;
}

// Bundled data fallback
async function loadBundledDictData(): Promise<{ wordDict: string; wordIndex: string }> {
    const [wordDict, wordIndex] = await Promise.all([
        fetch(chrome.runtime.getURL('data/cedict_ts.u8')).then(r => r.text()),
        fetch(chrome.runtime.getURL('data/cedict.idx')).then(r => r.text()),
    ]);
    return { wordDict, wordIndex };
}

// Load grammar/vocab keywords from bundled data
async function loadGrammarVocabKeywords(): Promise<[Record<string, boolean>, Record<string, boolean>]> {
    return await Promise.all([
        fetch(chrome.runtime.getURL('data/grammarKeywordsMin.json')).then(r => r.json()),
        fetch(chrome.runtime.getURL('data/vocabularyKeywordsMin.json')).then(r => r.json()),
    ]);
}

// --- Main loader ---
export class CedictLoader {
    async loadDictionary(): Promise<CedictDictionary> {
        const { wordDict, wordIndex, grammarKeywords, vocabKeywords } = await loadDictData();
        return new CedictDictionary(wordDict, wordIndex, grammarKeywords, vocabKeywords);
    }

    async refreshDictionary(): Promise<CedictDictionary> {
        const { wordDict, wordIndex, grammarKeywords, vocabKeywords } = await refreshDictData();
        return new CedictDictionary(wordDict, wordIndex, grammarKeywords, vocabKeywords);
    }
}

/**
 * Returns status information about the cached dictionary.
 */
export async function getDictStatus(): Promise<DictStatus> {
    try {
        const db = await openDB();
        const cached = await getFromDB(db);
        db.close();

        if (cached) {
            // Count index lines as approximate entry count
            const entryCount = cached.wordIndex.split('\n').length;
            return {
                hasCachedDict: true,
                cachedTimestamp: cached.timestamp,
                entryCount,
            };
        }
    } catch {
        // IndexedDB not available
    }

    return {
        hasCachedDict: false,
        cachedTimestamp: null,
        entryCount: null,
    };
}

/**
 * Forces a fresh download of CEDICT from MDBG, rebuilds the index,
 * and stores the result in IndexedDB. Returns the new dict data.
 * Throws if download fails.
 */
async function refreshDictData(): Promise<DictData> {
    logMessage('Downloading latest CEDICT from MDBG...');
    const wordDict = await downloadCEDICT();

    logMessage('Building index...');
    const wordIndex = buildIndex(wordDict);

    // Store in IndexedDB
    const db = await openDB();
    await putInDB(db, {
        id: 'cedict',
        wordDict,
        wordIndex,
        timestamp: Date.now(),
    });
    db.close();
    logMessage('CEDICT updated and cached in IndexedDB');

    const [grammarKeywords, vocabKeywords] = await loadGrammarVocabKeywords();
    return { wordDict, wordIndex, grammarKeywords, vocabKeywords };
}

/**
 * Loads the CC-CEDICT dictionary data, using IndexedDB cache when available,
 * downloading fresh data from MDBG when needed, and falling back to the
 * bundled extension data if all else fails.
 */
async function loadDictData(): Promise<DictData> {
    let wordDict: string;
    let wordIndex: string;

    try {
        const db = await openDB();
        const cached = await getFromDB(db);
        db.close();
        const now = Date.now();

        if (cached && (now - cached.timestamp) < UPDATE_INTERVAL_MS) {
            // Use cached data
            logMessage('Using cached CEDICT from IndexedDB');
            wordDict = cached.wordDict;
            wordIndex = cached.wordIndex;
        } else {
            // Try to download fresh data
            try {
                const freshData = await refreshDictData();
                wordDict = freshData.wordDict;
                wordIndex = freshData.wordIndex;
            } catch (downloadError) {
                logWarn('Download failed, using cached or bundled data:', downloadError);
                if (cached) {
                    // Use stale cache as fallback
                    wordDict = cached.wordDict;
                    wordIndex = cached.wordIndex;
                } else {
                    // No cache, fall back to bundled
                    const bundled = await loadBundledDictData();
                    wordDict = bundled.wordDict;
                    wordIndex = bundled.wordIndex;
                }
            }
        }
    } catch (dbError) {
        // IndexedDB not available or errored: fall back to bundled data
        logWarn('IndexedDB unavailable, using bundled data', dbError);
        const bundled = await loadBundledDictData();
        wordDict = bundled.wordDict;
        wordIndex = bundled.wordIndex;
    }

    const [grammarKeywords, vocabKeywords] = await loadGrammarVocabKeywords();
    return { wordDict, wordIndex, grammarKeywords, vocabKeywords };
}
