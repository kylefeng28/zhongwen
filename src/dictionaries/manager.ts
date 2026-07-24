import type { Dictionary, DictionaryLoader } from './dictionary';
import type { MultiDictSearchResult, DictionaryResult } from '../shared/types';
import { CedictDictionary } from './cedict';
import { CedictLoader, getDictStatus } from './cedict-loader';

/** All available loaders, keyed by dictionary ID */
const ALL_LOADERS: Record<string, DictionaryLoader> = {
    cedict: new CedictLoader(),
};

/**
 * Manages multiple dictionary instances and aggregates search results.
 */
export class DictionaryManager {
    private dictionaries: Dictionary[] = [];

    deactivate(): void {
        this.dictionaries = [];
    }

    addDictionary(dict: Dictionary): void {
        this.dictionaries.push(dict);
    }

    removeDictionary(id: string): void {
        this.dictionaries = this.dictionaries.filter(d => d.id !== id);
    }

    getDictionary(id: string): Dictionary | undefined {
        return this.dictionaries.find(d => d.id === id);
    }

    getDictionaryIds(): string[] {
        return this.dictionaries.map(d => d.id);
    }

    get loaded(): boolean {
        return this.dictionaries.length > 0;
    }

    /**
     * Load all enabled dictionaries in the configured order.
     */
    async loadDictionaries(enabledDicts: string[]): Promise<void> {
        this.dictionaries = [];

        // Load dictionaries in the order specified by enabledDicts
        for (const dictId of enabledDicts) {
            const loader = ALL_LOADERS[dictId];
            if (!loader) continue;

            try {
                const dict = await loader.loadDictionary();
                this.addDictionary(dict);
            } catch (err) {
                console.warn(`[Zhongwen] Failed to load dictionary '${dictId}':`, err);
            }
        }
    }

    /**
     * Force refresh all loaded dictionaries.
     */
    async refreshDictionaries(): Promise<void> {
        const ids = this.getDictionaryIds();
        this.dictionaries = [];

        for (const dictId of ids) {
            const loader = ALL_LOADERS[dictId];
            if (!loader) continue;

            try {
                const dict = await loader.refreshDictionary();
                this.addDictionary(dict);
            } catch (err) {
                console.warn(`[Zhongwen] Failed to refresh dictionary '${dictId}':`, err);
            }
        }
    }

    async getDictStatus() {
        return await getDictStatus();
    }

    /**
     * Search all registered dictionaries for the given text.
     * Returns aggregated results from all dictionaries as a MultiDictSearchResult.
     */
    search(text: string, maxResultsPerDict: number = 7): MultiDictSearchResult | null {
        const allResults: DictionaryResult[] = [];
        let maxMatchLen = 0;
        let hasMore = false;

        for (const dict of this.dictionaries) {
            const response = dict.search(text, maxResultsPerDict);
            if (!response) continue;

            if (response.matchLen > maxMatchLen) {
                maxMatchLen = response.matchLen;
            }
            allResults.push(...response.entries);
            if (response.more) hasMore = true;
        }

        if (allResults.length === 0) return null;

        const result: MultiDictSearchResult = {
            matchLen: maxMatchLen,
            results: allResults,
            more: hasMore || undefined,
        };

        // Check for grammar/vocab keywords in CEDICT entries
        const cedict = this.getDictionary('cedict') as CedictDictionary | undefined;
        if (cedict) {
            for (let i = 0; i < result.results.length; i++) {
                const entry = result.results[i];
                if (entry.source === 'cedict') {
                    const word = entry.headword;
                    if (cedict.hasGrammarKeyword(word) && result.matchLen === word.length) {
                        // the final index should be the last one with the maximum length
                        result.grammar = { keyword: word, index: i };
                    }
                    if (cedict.hasVocabKeyword(word) && result.matchLen === word.length) {
                        // the final index should be the last one with the maximum length
                        result.vocab = { keyword: word, index: i };
                    }
                }
            }
        }

        return result;
    }
}
