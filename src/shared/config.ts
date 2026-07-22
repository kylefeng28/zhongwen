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
};
