import { ZhongwenConfig } from './types';

export const defaultConfig: ZhongwenConfig = {
    background: 'yellow',
    fontSize: 'small',
    grammar: true,
    skritterTLD: 'com',
    saveToWordList: 'firstEntryOnly',
    simpTrad: 'classic',
    toneColors: true,
    toneColorScheme: 'standard',
    vocab: true,
    zhuyin: false,
    clipboardFormat: '{simplified}\t{traditional}\t{pinyin}\t{definition}',
    ttsEnabled: false,
    enabledDicts: ['cedict', 'taigi'],
};

let config: ZhongwenConfig = { ...defaultConfig };

export function loadConfig(callback = undefined) {
    return new Promise((resolve) => {
        chrome.storage.local.get(null, (storedConfig: Record<string, unknown>) => {
            if (storedConfig) {
                Object.entries(storedConfig).forEach(e => (config as unknown as Record<string, unknown>)[e[0]] = e[1]);
                console.log('[Zhongwen] Config loaded from chrome.storage')
            }
            else {
                console.log('[Zhongwen] No config saved in chrome.storage; using default config')
            }

            if (callback) {
                callback();
            }

            resolve(config);
        });
    })
}

export function getConfig(): ZhongwenConfig {
    return config;
}

