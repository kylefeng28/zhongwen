import type { DictionaryResult } from '../shared/types';

/**
 * Abstract interface for a dictionary source.
 * Each dictionary type (CEDICT, Taigi, Cantonese) implements this interface.
 */
export interface Dictionary {
    /** Unique identifier for this dictionary */
    readonly id: string;
    /** Display name */
    readonly name: string;

    /**
     * Search for a word in this dictionary.
     * The dictionary should attempt to match the longest prefix of `text`
     * and return results for all matching lengths.
     * @param text - The text to search (may be longer than any single word)
     * @param maxResults - Maximum number of results to return
     * @returns Search response, or null if no match found.
     */
    search(text: string, maxResults?: number): DictionaryResult | null;
}
