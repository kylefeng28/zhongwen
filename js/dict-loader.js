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

const CEDICT_URL = "https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz";
const DB_NAME = "zhongwen-dict";
const DB_VERSION = 1;
const STORE_NAME = "cedict";

/** How often to auto-refresh the dictionary (7 days in ms) */
const UPDATE_INTERVAL_MS = 7 * 24 * 60 * 60 * 1e3;

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: "id" });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function getFromDB(db) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const request = store.get("cedict");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function putInDB(db, data) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const request = store.put(data);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}
function buildIndex(dictText) {
    const indexMap = /* @__PURE__ */ new Map();
    const lines = dictText.split("\n");
    let offset = 0;
    for (const line of lines) {
        if (line && !line.startsWith("#")) {
            const match = line.match(/^(\S+)\s+(\S+)\s+/);
            if (match) {
                const traditional = match[1];
                const simplified = match[2];
                const simpOffsets = indexMap.get(simplified);
                if (simpOffsets) {
                    simpOffsets.push(offset);
                } else {
                    indexMap.set(simplified, [offset]);
                }
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
        offset += line.length + 1;
    }
    const entries = [];
    const sortedKeys = [...indexMap.keys()].sort();
    for (const key of sortedKeys) {
        entries.push(key + "," + indexMap.get(key).join(","));
    }
    return entries.join("\n");
}
async function downloadCEDICT() {
    const response = await fetch(CEDICT_URL);
    if (!response.ok) {
        throw new Error(`Failed to download CEDICT: ${response.status} ${response.statusText}`);
    }
    const compressedData = await response.arrayBuffer();
    const ds = new DecompressionStream("gzip");
    const decompressedStream = new Response(
        new Blob([compressedData]).stream().pipeThrough(ds)
    ).text();
    return decompressedStream;
}

async function loadBundledDictData() {
    const [wordDict, wordIndex] = await Promise.all([
        fetch(chrome.runtime.getURL("data/cedict_ts.u8")).then((r) => r.text()),
        fetch(chrome.runtime.getURL("data/cedict.idx")).then((r) => r.text())
    ]);
    return { wordDict, wordIndex };
}

async function loadGrammarVocabKeywords() {
    return await Promise.all([
        fetch(chrome.runtime.getURL("data/grammarKeywordsMin.json")).then((r) => r.json()),
        fetch(chrome.runtime.getURL("data/vocabularyKeywordsMin.json")).then((r) => r.json())
    ]);
}

export async function getDictStatus() {
    try {
        const db = await openDB();
        const cached = await getFromDB(db);
        db.close();
        if (cached) {
            const entryCount = cached.wordIndex.split("\n").length;
            return {
                hasCachedDict: true,
                cachedTimestamp: cached.timestamp,
                entryCount
            };
        }
    } catch (dbError) {
        // IndexedDB not available
        console.warn("[Zhongwen] IndexedDB unavailable, could not fetch status", dbError);
    }
    return {
        hasCachedDict: false,
        cachedTimestamp: null,
        entryCount: null
    };
}

/**
 * Forces a fresh download of CEDICT from MDBG, rebuilds the index,
 * and stores the result in IndexedDB. Returns the new dict data.
 * Throws if download fails.
 */
export async function refreshDictData() {
    console.log("[Zhongwen] Downloading latest CEDICT from MDBG...");
    const wordDict = await downloadCEDICT();

    console.log("[Zhongwen] Building index...");
    const wordIndex = buildIndex(wordDict);

    // Store in IndexedDB
    const db = await openDB();
    await putInDB(db, {
        id: "cedict",
        wordDict,
        wordIndex,
        timestamp: Date.now()
    });
    db.close();
    console.log("[Zhongwen] CEDICT updated and cached in IndexedDB");
    const [grammarKeywords, vocabKeywords] = await loadGrammarVocabKeywords();
    return { wordDict, wordIndex, grammarKeywords, vocabKeywords };
}

/**
 * Loads the CC-CEDICT dictionary data, using IndexedDB cache when available,
 * downloading fresh data from MDBG when needed, and falling back to the
 * bundled extension data if all else fails.
 */
export async function loadDictData() {
    let wordDict;
    let wordIndex;

    try {
        const db = await openDB();
        const cached = await getFromDB(db);
        db.close();
        const now = Date.now();

        if (cached && now - cached.timestamp < UPDATE_INTERVAL_MS) {
            console.log("[Zhongwen] Using cached CEDICT from IndexedDB");
            wordDict = cached.wordDict;
            wordIndex = cached.wordIndex;
        } else {
            try {
                const freshData = await refreshDictData();
                wordDict = freshData.wordDict;
                wordIndex = freshData.wordIndex;
            } catch (downloadError) {
                console.warn("[Zhongwen] Download failed, using cached or bundled data:", downloadError);
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
        console.warn("[Zhongwen] IndexedDB unavailable, using bundled data", dbError);
        const bundled = await loadBundledDictData();
        wordDict = bundled.wordDict;
        wordIndex = bundled.wordIndex;
    }

    const [grammarKeywords, vocabKeywords] = await loadGrammarVocabKeywords();
    return [wordDict, wordIndex, grammarKeywords, vocabKeywords];
}
