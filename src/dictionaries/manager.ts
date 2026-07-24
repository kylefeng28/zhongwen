import { CedictDictionary } from './cedict';
import { loadDictData, refreshDictData, getDictStatus  } from './cedict-loader';

export class DictionaryManager {
    public cedict: CedictDictionary = null;

    deactivate(): void {
        this.cedict = null;
    }

    async loadDictionary(): Promise<void> {
        const { wordDict, wordIndex, grammarKeywords, vocabKeywords } = await loadDictData();
        this.cedict = new CedictDictionary(wordDict, wordIndex, grammarKeywords, vocabKeywords);
    }

    async refreshDictionary(): Promise<void> {
        // Replace the dictionary instance with the refreshed instance
        const { wordDict, wordIndex, grammarKeywords, vocabKeywords } = await refreshDictData();
        this.cedict = new CedictDictionary(wordDict, wordIndex, grammarKeywords, vocabKeywords);
    }

    async getDictStatus(): Promise<DictStatus> {
        return await getDictStatus();
    }

}
