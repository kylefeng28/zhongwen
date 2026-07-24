/*
 Zhongwen - A Chinese-English Pop-Up Dictionary
 Copyright (C) 2019 Christian Schiller
 https://chrome.google.com/extensions/detail/kkmlkkjojmombglmlpbpapmhcaljjkde

 ---

 Originally based on Rikaikun 0.8
 Copyright (C) 2010 Erek Speed
 http://code.google.com/p/rikaikun/

 ---

 Originally based on Rikaichan 1.07
 by Jonathan Zarate
 http://www.polarcloud.com/

 ---

 Originally based on RikaiXUL 0.4 by Todd Rudick
 http://www.rikai.com/
 http://rikaixul.mozdev.org/

 ---

 This program is free software; you can redistribute it and/or modify
 it under the terms of the GNU General Public License as published by
 the Free Software Foundation; either version 2 of the License, or
 (at your option) any later version.

 This program is distributed in the hope that it will be useful,
 but WITHOUT ANY WARRANTY; without even the implied warranty of
 MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 GNU General Public License for more details.

 You should have received a copy of the GNU General Public License
 along with this program; if not, write to the Free Software
 Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA  02110-1301  USA

 ---

 Please do not change or remove any of the copyrights or links to web pages
 when modifying any of the files.

 */

'use strict';

import type { Dictionary } from './dictionary';
import type { DictSearchResponse, DictionaryResult, Definition } from '../shared/types';

/** Regex to parse a CEDICT line: traditional simplified [pinyin] /def1/def2/ */
const CEDICT_LINE_RE = /^([^\s]+?)\s+([^\s]+?)\s+\[(.*?)\]?\s*\/(.+)\//;

export const ID = 'cedict';
export const NAME = 'CC-CEDICT (Mandarin Chinese → English)';

export class CedictDictionary implements Dictionary {
    readonly id = ID;

    wordDict: string;
    wordIndex: string;
    grammarKeywords: Record<string, boolean>;
    vocabKeywords: Record<string, boolean>;
    cache: Record<string, string[]>;

    constructor(wordDict: string, wordIndex: string, grammarKeywords: Record<string, boolean>, vocabKeywords: Record<string, boolean>) {
        this.wordDict = wordDict;
        this.wordIndex = wordIndex;
        this.grammarKeywords = grammarKeywords;
        this.vocabKeywords = vocabKeywords;
        this.cache = {};
    }

    static find(needle: string, haystack: string): string | null {

        let beg = 0;
        let end = haystack.length - 1;

        while (beg < end) {
            let mi = Math.floor((beg + end) / 2);
            let i = haystack.lastIndexOf('\n', mi) + 1;

            let mis = haystack.substr(i, needle.length);
            if (needle < mis) {
                end = i - 1;
            } else if (needle > mis) {
                beg = haystack.indexOf('\n', mi + 1) + 1;
            } else {
                return haystack.substring(i, haystack.indexOf('\n', mi + 1));
            }
        }

        return null;
    }

    hasGrammarKeyword(keyword: string): boolean | undefined {
        return this.grammarKeywords[keyword];
    }

    hasVocabKeyword(keyword: string): boolean | undefined {
        return this.vocabKeywords[keyword];
    }

    search(text: string, maxResults: number = 7): DictSearchResponse | null {
        let word = text;
        let dict = this.wordDict;
        let index = this.wordIndex;

        let data: [string, string][] = [];
        let count = 0;
        let maxLen = 0;
        let more = false;

        WHILE:
            while (word.length > 0) {

                let ix = this.cache[word];
                if (!ix) {
                    let findResult = CedictDictionary.find(word + ',', index);
                    if (!findResult) {
                        this.cache[word] = [];
                        word = word.substr(0, word.length - 1);
                        continue;
                    }
                    ix = findResult.split(',');
                    this.cache[word] = ix;
                }

                for (let j = 1; j < ix.length; ++j) {
                    let offset = Number(ix[j]);

                    let dentry = dict.substring(offset, dict.indexOf('\n', offset));

                    if (count >= maxResults) {
                        more = true;
                        break WHILE;
                    }

                    ++count;
                    if (maxLen === 0) {
                        maxLen = word.length;
                    }

                    data.push([dentry, word]);
                }

                word = word.substr(0, word.length - 1);
            }

        if (data.length === 0) {
            return null;
        }

        // Convert raw CEDICT lines to normalized DictionaryResult entries
        const entries: DictionaryResult[] = [];
        for (const [line] of data) {
            const parsed = this.parseLine(line);
            if (parsed) entries.push(parsed);
        }

        return { matchLen: maxLen, entries, more };
    }

    /** Parse a raw CEDICT line into a normalized DictionaryResult */
    private parseLine(line: string): DictionaryResult | null {
        const match = line.match(CEDICT_LINE_RE);
        if (!match) return null;

        const [, traditional, simplified, pinyin, rawDefs] = match;

        // Split definitions on '/' and create Definition objects
        const definitions: Definition[] = rawDefs.split('/').map(def => ({ def }));

        return {
            headword: simplified,
            traditional: traditional !== simplified ? traditional : undefined,
            reading: pinyin,
            definitions,
            source: 'cedict',
        };
    }
}
