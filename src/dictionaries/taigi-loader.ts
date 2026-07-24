import { TaigiDictionary } from './taigi';
import type { DictionaryLoader } from './dictionary';

/**
 * Loader for the Taigi (Taiwanese Hokkien) dictionary.
 * Loads the bundled dict-twblg.json data from the extension.
 */
export class TaigiLoader implements DictionaryLoader {
    readonly id = 'taigi';

    async loadDictionary(): Promise<TaigiDictionary> {
        const data = await fetch(chrome.runtime.getURL('data/dict-twblg.json')).then(r => r.json());
        return new TaigiDictionary(data);
    }

    async refreshDictionary(): Promise<TaigiDictionary> {
        // Taigi data is bundled; refresh just reloads from bundle
        return this.loadDictionary();
    }
}
