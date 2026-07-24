import { CedictDictionary } from './cedict';
import { loadDictData, refreshDictData } from './cedict-loader';
export { getDictStatus } from './cedict-loader.ts';

export async function loadDictionary(): Promise<CedictDictionary> {
    const { wordDict, wordIndex, grammarKeywords, vocabKeywords } = await loadDictData();
    return new CedictDictionary(wordDict, wordIndex, grammarKeywords, vocabKeywords);
}

export async function refreshDictionary(): Promise<CedictDictionary> {
    // Return a new dictionary instance with fresh data
    const { wordDict, wordIndex, grammarKeywords, vocabKeywords } = await refreshDictData();
    return new CedictDictionary(wordDict, wordIndex, grammarKeywords, vocabKeywords);
}
