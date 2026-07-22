/** Configuration options for the Zhongwen extension */
export interface ZhongwenConfig {
    background: string;
    fontSize: string;
    grammar: boolean;
    skritterTLD: string;
    saveToWordList: string;
    simpTrad: string;
    toneColors: boolean;
    toneColorScheme: string;
    vocab: boolean;
    zhuyin: boolean;
    /** Format string for clipboard copy. Placeholders: {simplified}, {traditional}, {pinyin}, {definition} */
    clipboardFormat: string;
}

/** A dictionary entry tuple: [dentry, word] */
export type DictionaryEntry = [dentry: string, word: string];

/** Result of a dictionary search */
export interface SearchResult {
    data: DictionaryEntry[];
    matchLen: number;
    more?: number;
    grammar?: { keyword: string; index: number };
    vocab?: { keyword: string; index: number };
}

/** An entry in the user's word list */
export interface WordListEntry {
    timestamp: number;
    simplified: string;
    traditional: string;
    pinyin: string;
    definition: string;
    notes?: string;
}

/** Represents the end position of a text selection */
export interface SelectionEnd {
    node: Node;
    offset: number;
}

/**
 * The result of the regex match on a dictionary line.
 * Tuple of [full, simplified, traditional, pinyin, definition] or null.
 */
export type ParsedEntry =
    | [full: string, simplified: string, traditional: string, pinyin: string, definition: string]
    | null;

/** Message types used for communication between extension components */
export type MessageType =
    | 'enable'
    | 'disable'
    | 'showPopup'
    | 'showHelp'
    | 'search'
    | 'open'
    | 'add';
