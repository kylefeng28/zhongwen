import type { Dictionary } from './dictionary';
import type { SearchResult } from './shared/types';

import { CedictLoader, getDictStatus  } from './cedict-loader';

export class DictionaryManager {
    private dictionaries: Dictionary[] = [];
    private loaders = [new CedictLoader()];

    deactivate(): void {
        this.dictionaries = [];
    }

    addDictionary(dict: Dictionary): void {
        this.dictionaries.push(dict);
    }

    removeDictionary(id: string): void {
        this.dictionaries = this.dictionaries.filter(d => d.id !== id);
    }

    async loadDictionaries(): Promise<void> {
        this.dictionaries = [];
        for (const loader of this.loaders) {
            this.addDictionary(await loader.loadDictionary());
        }
    }

    async refreshDictionaries(): Promise<void> {
        this.dictionaries = [];
        for (const loader of this.loaders) {
            this.addDictionary(await loader.refreshDictionary());
        }
    }

    async getDictStatus(): Promise<DictStatus> {
        return await getDictStatus();
    }

    search(text: string, maxResultsPerDict: number = 7): SearchResult | null {
        const allResults = [];

        for (const dict of this.dictionaries) {
            let result = dict.search(text, maxResultsPerDict);

            if (!result) {
                continue;
            }

            if (dict.id === 'cedict') {
                for (let i = 0; i < result.data.length; i++) {
                    let word: string = result.data[i][1];
                    if (dict.hasGrammarKeyword(word) && (result.matchLen === word.length)) {
                        // the final index should be the last one with the maximum length
                        result.grammar = { keyword: word, index: i };
                    }
                    if (dict.hasVocabKeyword(word) && (result.matchLen === word.length)) {
                        // the final index should be the last one with the maximum length
                        result.vocab = { keyword: word, index: i };
                    }
                }
            }

            allResults.push(result);
        }

        return {
            data: allResults.map(x => x.data).flat(),
            matchLen: Math.max(allResults.map(x => x.matchLen)),
        } as SearchResult;
    }

}
