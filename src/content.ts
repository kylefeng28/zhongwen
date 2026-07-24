/*
 Zhongwen - A Chinese-English Pop-Up Dictionary
 Copyright (C) 2010-2023 Christian Schiller
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

import { getConfig, loadConfig } from './shared/config';
import { numericPinyin2Zhuyin } from './shared/zhuyin';
import { ttsMandarin, ttsCantonese } from './tts';
import type { ZhongwenConfig, MultiDictSearchResult, DictionaryResult, SelectionEnd } from './shared/types';

let config: ZhongwenConfig = getConfig();
loadConfig();

chrome.storage.onChanged.addListener((changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {

    if (areaName !== 'local') return;

    // format: {"background":{"newValue":"lightblue","oldValue":"blue"}, "toneColors":{"newValue":false,"oldValue":true}}
    loadConfig();
});

let savedTarget: EventTarget | null = null;

let savedRangeNode: Text | null = null;

let savedRangeOffset: number = 0;

let selText: string | null = null;

let clientX: number = 0;

let clientY: number = 0;

let selStartDelta: number = 0;

let selStartIncrement: number = 0;

let popX: number = 0;

let popY: number = 0;

let timer: ReturnType<typeof setTimeout> | null = null;

let altView: number = 0;

let savedSearchResults: string[][] & { grammar?: MultiDictSearchResult['grammar']; vocab?: MultiDictSearchResult['vocab'] } = [];

let savedSelStartOffset: number = 0;

let savedSelEndList: SelectionEnd[] = [];

function enableTab(): void {
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('keydown', onKeyDown);
}

function disableTab(): void {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('keydown', onKeyDown);

    let popup = document.getElementById('zhongwen-window');
    if (popup) {
        popup.parentNode!.removeChild(popup);
    }

    clearHighlight();
}

function onKeyDown(keyDown: KeyboardEvent): void {

    if (keyDown.ctrlKey || keyDown.metaKey) {
        return;
    }

    if (keyDown.keyCode === 27) {
        // esc key pressed
        hidePopup();
        return;
    }

    if (keyDown.altKey && keyDown.keyCode === 87) {
        // Alt + w
        chrome.runtime.sendMessage({
            type: 'open',
            tabType: 'wordlist',
            url: '/wordlist.html'
        });
        return;
    }

    if (!isVisible()) {
        return;
    }

    switch (keyDown.keyCode) {

        case 65: // 'a'
            altView = (altView + 1) % 3;
            triggerSearch();
            break;

        case 67: // 'c' or 'C'
            if (keyDown.shiftKey) {
                // 'C' — copy all entries
                copyToClipboard(getTextForClipboard(false));
            } else {
                // 'c' — copy first entry only
                copyToClipboard(getTextForClipboard(true));
            }
            break;

        case 66: // 'b'
        {
            let offset = selStartDelta;
            for (let i = 0; i < 10; i++) {
                selStartDelta = --offset;
                let ret = triggerSearch();
                if (ret === 0) {
                    break;
                } else if (ret === 2) {
                    savedRangeNode = findPreviousTextNode(savedRangeNode!.parentNode, savedRangeNode) as Text | null;
                    savedRangeOffset = 0;
                    offset = savedRangeNode!.data.length;
                }
            }
        }
            break;

        case 71: // 'g'
            if (config.grammar && savedSearchResults.grammar) {
                let sel = encodeURIComponent(window.getSelection()!.toString());

                // https://resources.allsetlearning.com/chinese/grammar/%E4%B8%AA
                let allset = 'https://resources.allsetlearning.com/chinese/grammar/' + sel;

                chrome.runtime.sendMessage({
                    type: 'open',
                    tabType: 'grammar',
                    url: allset
                });
            }
            break;

        case 77: // 'm'
            selStartIncrement = 1;
        // falls through
        case 78: // 'n'
            for (let i = 0; i < 10; i++) {
                selStartDelta += selStartIncrement;
                let ret = triggerSearch();
                if (ret === 0) {
                    break;
                } else if (ret === 2) {
                    savedRangeNode = findNextTextNode(savedRangeNode!.parentNode, savedRangeNode) as Text | null;
                    savedRangeOffset = 0;
                    selStartDelta = 0;
                    selStartIncrement = 0;
                }
            }
            break;

        case 82: // 'r'
        {
            let entries: Array<{ simplified: string; traditional: string; pinyin: string; definition: string }> = [];
            for (let j = 0; j < savedSearchResults.length; j++) {
                let entry = {
                    simplified: savedSearchResults[j][0],
                    traditional: savedSearchResults[j][1],
                    pinyin: savedSearchResults[j][2],
                    definition: savedSearchResults[j][3]
                };
                entries.push(entry);
            }

            chrome.runtime.sendMessage({
                'type': 'add',
                'entries': entries
            });

            showPopup('Added to word list.<p>Press Alt+W to open word list.', null, -1, -1);
        }
            break;

        case 83: // 's'
            {

                // https://www.skritter.com/vocab/api/add?from=Chrome&lang=zh&word=浏览&trad=瀏 覽&rdng=liú lǎn&defn=to skim over; to browse

                let skritter = 'https://skritter.com';
                if (config.skritterTLD === 'cn') {
                    skritter = 'https://skritter.cn';
                }

                skritter +=
                    '/vocab/api/add?from=zhongwen&ref=zhongwen&lang=zh&word=' +
                    encodeURIComponent(savedSearchResults[0][0]) +
                    '&trad=' + encodeURIComponent(savedSearchResults[0][1]) +
                    '&rdng=' + encodeURIComponent(savedSearchResults[0][4]) +
                    '&defn=' + encodeURIComponent(savedSearchResults[0][3]);

                chrome.runtime.sendMessage({
                    type: 'open',
                    tabType: 'skritter',
                    url: skritter
                });
            }
            break;

        case 84: // 't'
            {
                let sel = encodeURIComponent(
                    window.getSelection()!.toString());

                // https://tatoeba.org/eng/sentences/search?from=cmn&to=eng&query=%E8%BF%9B%E8%A1%8C
                let tatoeba = 'https://tatoeba.org/eng/sentences/search?from=cmn&to=eng&query=' + sel;

                chrome.runtime.sendMessage({
                    type: 'open',
                    tabType: 'tatoeba',
                    url: tatoeba
                });
            }
            break;

        case 86: // 'v'
            if (config.vocab && savedSearchResults.vocab) {
                let sel = encodeURIComponent(window.getSelection()!.toString());

                // https://resources.allsetlearning.com/chinese/vocabulary/%E4%B8%AA
                let allset = 'https://resources.allsetlearning.com/chinese/vocabulary/' + sel;

                chrome.runtime.sendMessage({
                    type: 'open',
                    tabType: 'vocab',
                    url: allset
                });
            }
            break;

        case 88: // 'x'
            altView = 0;
            popY -= 20;
            triggerSearch();
            break;

        case 89: // 'y'
            altView = 0;
            popY += 20;
            triggerSearch();
            break;

        case 49: // '1'
            if (keyDown.altKey) {

                // use the simplified character for linedict lookup
                let simp: string = savedSearchResults[0][0];

                // https://english.dict.naver.com/english-chinese-dictionary/#/search?query=%E8%AF%8D%E5%85%B8
                let linedict = 'https://english.dict.naver.com/english-chinese-dictionary/#/search?query=' +
                    encodeURIComponent(simp);

                chrome.runtime.sendMessage({
                    type: 'open',
                    tabType: 'linedict',
                    url: linedict
                });
            }
            break;

        case 50: // '2'
            if (keyDown.altKey) {
                let sel = encodeURIComponent(
                    window.getSelection()!.toString());

                // https://forvo.com/search/%E4%B8%AD%E6%96%87/zh/
                let forvo = 'https://forvo.com/search/' + sel + '/zh/';

                chrome.runtime.sendMessage({
                    type: 'open',
                    tabType: 'forvo',
                    url: forvo
                });
            }
            break;

        case 51: // '3'
            if (keyDown.altKey) {
                let sel = encodeURIComponent(
                    window.getSelection()!.toString());

                // https://dict.cn/%E7%BF%BB%E8%AF%91
                let dictcn = 'https://dict.cn/' + sel;

                chrome.runtime.sendMessage({
                    type: 'open',
                    tabType: 'dictcn',
                    url: dictcn
                });
            }
            break;

        case 52: // '4'
            if (keyDown.altKey) {
                let sel = encodeURIComponent(
                    window.getSelection()!.toString());

                // https://www.iciba.com/%E4%B8%AD%E9%A4%90
                let iciba = 'https://www.iciba.com/' + sel;

                chrome.runtime.sendMessage({
                    type: 'open',
                    tabType: 'iciba',
                    url: iciba
                });
            }
            break;

        case 53: // '5'
            if (keyDown.altKey) {
                let sel = encodeURIComponent(
                    window.getSelection()!.toString());

                // https://www.mdbg.net/chinese/dictionary?page=worddict&wdrst=0&wdqb=%E4%B8%AD%E6%96%87
                let mdbg = 'https://www.mdbg.net/chinese/dictionary?page=worddict&wdrst=0&wdqb=' + sel;

                chrome.runtime.sendMessage({
                    type: 'open',
                    tabType: 'mdbg',
                    url: mdbg
                });
            }
            break;

        case 54: // '6'
            if (keyDown.altKey) {
                let sel = encodeURIComponent(
                    window.getSelection()!.toString());

                let reverso = 'https://context.reverso.net/translation/chinese-english/' + sel;

                chrome.runtime.sendMessage({
                    type: 'open',
                    tabType: 'reverso',
                    url: reverso
                });
            }
            break;

        case 55: // '7'
            if (keyDown.altKey) {

                // use the traditional character for moedict lookup
                let trad: string = savedSearchResults[0][1];

                // https://www.moedict.tw/~%E4%B8%AD%E6%96%87
                let moedict = 'https://www.moedict.tw/~' + encodeURIComponent(trad);

                chrome.runtime.sendMessage({
                    type: 'open',
                    tabType: 'moedict',
                    url: moedict
                });
            }
            break;

        case 87: // 'w': TTS Mandarin
            if (config.ttsEnabled) {
                ttsMandarin(window.getSelection()?.toString() || '');
            }
            break;

        case 69: // 'e': TTS Cantonese
            if (config.ttsEnabled) {
                ttsCantonese(window.getSelection()?.toString() || '');
            }
            break;

        default:
            return;
    }
}

function onMouseMove(mouseMove: MouseEvent): void {
    if ((mouseMove.target as HTMLElement).nodeName === 'TEXTAREA' || (mouseMove.target as HTMLElement).nodeName === 'INPUT'
        || (mouseMove.target as HTMLElement).nodeName === 'DIV') {

        let div = document.getElementById('zhongwenDiv');

        if (mouseMove.altKey) {

            if (!div && ((mouseMove.target as HTMLElement).nodeName === 'TEXTAREA' || (mouseMove.target as HTMLElement).nodeName === 'INPUT')) {

                div = makeDiv(mouseMove.target as HTMLInputElement | HTMLTextAreaElement);
                document.body.appendChild(div);
                div.scrollTop = (mouseMove.target as HTMLInputElement | HTMLTextAreaElement).scrollTop;
                div.scrollLeft = (mouseMove.target as HTMLInputElement | HTMLTextAreaElement).scrollLeft;
            }
        } else {
            if (div) {
                document.body.removeChild(div);
            }
        }
    }

    if (clientX && clientY) {
        if (mouseMove.clientX === clientX && mouseMove.clientY === clientY) {
            return;
        }
    }
    clientX = mouseMove.clientX;
    clientY = mouseMove.clientY;

    let range: Range | CaretPosition | null;
    let rangeNode: Node | null;
    let rangeOffset: number;

    // Handle Chrome and Firefox
    if (document.caretRangeFromPoint) {
        range = document.caretRangeFromPoint(mouseMove.clientX, mouseMove.clientY);
        if (range === null) {
            return;
        }
        rangeNode = range.startContainer;
        rangeOffset = range.startOffset;
    } else if (document.caretPositionFromPoint) {
        range = document.caretPositionFromPoint(mouseMove.clientX, mouseMove.clientY);
        if (range === null) {
            return;
        }
        rangeNode = range.offsetNode;
        rangeOffset = range.offset;
    } else {
        return;
    }

    if (mouseMove.target === savedTarget) {
        if (rangeNode === savedRangeNode && rangeOffset === savedRangeOffset) {
            return;
        }
    }

    if (timer) {
        clearTimeout(timer);
        timer = null;
    }

    if ((rangeNode as Text).data && rangeOffset === (rangeNode as Text).data.length) {
        rangeNode = findNextTextNode(rangeNode!.parentNode, rangeNode);
        rangeOffset = 0;
    }

    if (!rangeNode || rangeNode.parentNode !== mouseMove.target) {
        rangeNode = null;
        rangeOffset = -1;
    }

    savedTarget = mouseMove.target;
    savedRangeNode = rangeNode as Text | null;
    savedRangeOffset = rangeOffset;

    selStartDelta = 0;
    selStartIncrement = 1;

    if (rangeNode && (rangeNode as Text).data && rangeOffset < (rangeNode as Text).data.length) {
        popX = mouseMove.clientX;
        popY = mouseMove.clientY;
        timer = setTimeout(() => triggerSearch(), 50);
        return;
    }

    // Don't close just because we moved from a valid pop-up slightly over to a place with nothing.
    let dx: number = popX - mouseMove.clientX;
    let dy: number = popY - mouseMove.clientY;
    let distance: number = Math.sqrt(dx * dx + dy * dy);
    if (distance > 4) {
        clearHighlight();
        hidePopup();
    }
}

function triggerSearch(): number {

    let rangeNode: Text | null = savedRangeNode;
    let selStartOffset: number = savedRangeOffset + selStartDelta;

    selStartIncrement = 1;

    if (!rangeNode) {
        clearHighlight();
        hidePopup();
        return 1;
    }

    if (selStartOffset < 0 || rangeNode.data.length <= selStartOffset) {
        clearHighlight();
        hidePopup();
        return 2;
    }

    let u: number = rangeNode.data.charCodeAt(selStartOffset);

    let isChineseCharacter: boolean = !isNaN(u) && (
        u === 0x25CB ||
        (0x3400 <= u && u <= 0x9FFF) ||
        (0xF900 <= u && u <= 0xFAFF) ||
        (0xFF21 <= u && u <= 0xFF3A) ||
        (0xFF41 <= u && u <= 0xFF5A) ||
        (0xD800 <= u && u <= 0xDFFF)
    );

    if (!isChineseCharacter) {
        clearHighlight();
        hidePopup();
        return 3;
    }

    let selEndList: SelectionEnd[] = [];
    let text = getText(rangeNode, selStartOffset, selEndList, 30 /*maxlength*/);

    savedSelStartOffset = selStartOffset;
    savedSelEndList = selEndList;

    chrome.runtime.sendMessage({
            'type': 'search',
            'text': text
        },
        processSearchResult
    );

    return 0;
}

function processSearchResult(result: MultiDictSearchResult | null): void {

    let selStartOffset: number = savedSelStartOffset;
    let selEndList: SelectionEnd[] = savedSelEndList;

    if (!result) {
        hidePopup();
        clearHighlight();
        return;
    }

    selStartIncrement = result.matchLen;
    selStartDelta = (selStartOffset - savedRangeOffset);

    let rangeNode: Text | null = savedRangeNode;
    // don't try to highlight form elements
    if (!('form' in (savedTarget as Element))) {
        let doc: Document = rangeNode!.ownerDocument!;
        if (!doc) {
            clearHighlight();
            hidePopup();
            return;
        }
        highlightMatch(doc, rangeNode!, selStartOffset, result.matchLen, selEndList);
    }

    showPopup(makeHtml(result, config.toneColors), savedTarget, popX, popY, false);
}

// modifies selEndList as a side-effect
function getText(startNode: Text, offset: number, selEndList: SelectionEnd[], maxLength: number): string {
    let text = '';
    let endIndex: number;

    if (startNode.nodeType !== Node.TEXT_NODE) {
        return '';
    }

    endIndex = Math.min(startNode.data.length, offset + maxLength);
    text += startNode.data.substring(offset, endIndex);
    selEndList.push({
        node: startNode,
        offset: endIndex
    });

    let nextNode: Node | null = startNode;
    while ((text.length < maxLength) && ((nextNode = findNextTextNode(nextNode!.parentNode, nextNode)) !== null)) {
        text += getTextFromSingleNode(nextNode as Text, selEndList, maxLength - text.length);
    }

    return text;
}

// modifies selEndList as a side-effect
function getTextFromSingleNode(node: Text, selEndList: SelectionEnd[], maxLength: number): string {
    let endIndex: number;

    if (node.nodeName === '#text') {
        endIndex = Math.min(maxLength, node.data.length);
        selEndList.push({
            node: node,
            offset: endIndex
        });
        return node.data.substring(0, endIndex);
    } else {
        return '';
    }
}

function showPopup(html: string, elem?: EventTarget | null, x?: number, y?: number, looseWidth?: boolean): void {

    if (!x || !y) {
        x = y = 0;
    }

    let popup = document.getElementById('zhongwen-window');

    if (!popup) {
        popup = document.createElement('div');
        popup.setAttribute('id', 'zhongwen-window');
        document.documentElement.appendChild(popup);
    }

    popup.style.width = 'auto';
    popup.style.height = 'auto';
    popup.style.maxWidth = (looseWidth ? '' : '600px');
    popup.className = `background-${config.background} tonecolor-${config.toneColorScheme}`;

    popup.innerHTML = html;

    if (elem) {
        popup.style.top = '-1000px';
        popup.style.left = '0px';
        popup.style.display = '';

        let pW: number = popup.offsetWidth;
        let pH: number = popup.offsetHeight;

        if (pW <= 0) {
            pW = 200;
        }
        if (pH <= 0) {
            pH = 0;
            let j: number = 0;
            while ((j = html.indexOf('<br/>', j)) !== -1) {
                j += 5;
                pH += 22;
            }
            pH += 25;
        }

        if (altView === 1) {
            x = window.scrollX;
            y = window.scrollY;
        } else if (altView === 2) {
            x = (window.innerWidth - (pW + 20)) + window.scrollX;
            y = (window.innerHeight - (pH + 20)) + window.scrollY;
        } else if (elem instanceof window.HTMLOptionElement) {

            x = 0;
            y = 0;

            let p = elem as HTMLElement | null;
            while (p) {
                x += p.offsetLeft;
                y += p.offsetTop;
                p = p.offsetParent as HTMLElement;
            }

            if ((elem as HTMLOptionElement).offsetTop > ((elem as HTMLOptionElement).parentNode as HTMLElement).clientHeight) {
                y -= (elem as HTMLOptionElement).offsetTop;
            }

            if (x + popup.offsetWidth > window.innerWidth) {
                // too much to the right, go left
                x -= popup.offsetWidth + 5;
                if (x < 0) {
                    x = 0;
                }
            } else {
                // use SELECT's width
                x += ((elem as HTMLOptionElement).parentNode as HTMLElement).offsetWidth + 5;
            }
        } else {
            // go left if necessary
            if (x + pW > window.innerWidth - 20) {
                x = (window.innerWidth - pW) - 20;
                if (x < 0) {
                    x = 0;
                }
            }

            // below the mouse
            let v: number = 25;

            // go up if necessary
            if (y + v + pH > window.innerHeight) {
                let t: number = y - pH - 30;
                if (t >= 0) {
                    y = t;
                }
            } else  {
                y += v;
            }

            x += window.scrollX;
            y += window.scrollY;
        }
    } else {
        x += window.scrollX;
        y += window.scrollY;
    }

    // (-1, -1) indicates: leave position unchanged
    if (x !== -1 && y !== -1) {
        popup.style.left = x + 'px';
        popup.style.top = y + 'px';
        popup.style.display = '';
    }
}

function hidePopup(): void {
    let popup = document.getElementById('zhongwen-window');
    if (popup) {
        popup.style.display = 'none';
        popup.textContent = '';
    }
}

function highlightMatch(doc: Document, rangeStartNode: Text, rangeStartOffset: number, matchLen: number, selEndList: SelectionEnd[]): void {
    if (!selEndList || selEndList.length === 0) return;

    let selEnd: SelectionEnd = selEndList[0];
    let offset = rangeStartOffset + matchLen;

    for (let i = 0, len = selEndList.length; i < len; i++) {
        selEnd = selEndList[i];
        if (offset <= selEnd.offset) {
            break;
        }
        offset -= selEnd.offset;
    }

    let range: Range = doc.createRange();
    range.setStart(rangeStartNode, rangeStartOffset);
    range.setEnd(selEnd.node, offset);

    let sel: Selection | null = window.getSelection();
    if (!sel) return;
    if (!sel.isCollapsed && selText !== sel.toString())
        return;
    sel.empty();
    sel.addRange(range);
    selText = sel.toString();
}

function clearHighlight(): void {

    if (selText === null) {
        return;
    }

    let selection: Selection | null = window.getSelection();
    if (!selection) return;
    if (selection.isCollapsed || selText === selection.toString()) {
        selection.empty();
    }
    selText = null;
}

function isVisible(): boolean {
    let popup = document.getElementById('zhongwen-window');
    return !!(popup && popup.style.display !== 'none');
}

/**
 * Formats a single search result entry using the configured clipboard format string.
 * Placeholders: {simplified}, {traditional}, {pinyin}, {definition}
 */
function formatEntry(entry: string[], format: string): string {
    return format
        .replace(/\\t/g, '\t')
        .replace(/\\n/g, '\n')
        .replace(/\{simplified\}/g, entry[0] || '')
        .replace(/\{traditional\}/g, entry[1] || '')
        .replace(/\{pinyin\}/g, entry[2] || '')
        .replace(/\{definition\}/g, entry[3] || '');
}

function getTextForClipboard(firstOnly: boolean): string {
    if (savedSearchResults.length === 0) return '';

    const format = config.clipboardFormat;
    const entries = firstOnly ? [savedSearchResults[0]] : savedSearchResults;

    let result = '';
    for (let i = 0; i < entries.length; i++) {
        result += formatEntry(entries[i], format);
        result += '\n';
    }
    return result;
}

function makeDiv(input: HTMLInputElement | HTMLTextAreaElement): HTMLDivElement {
    let div = document.createElement('div');

    div.id = 'zhongwenDiv';

    let text: string;
    if (input.value) {
        text = input.value;
    } else {
        text = '';
    }
    div.innerText = text;

    div.style.cssText = window.getComputedStyle(input, '').cssText;
    div.scrollTop = input.scrollTop;
    div.scrollLeft = input.scrollLeft;
    div.style.position = 'absolute';
    div.style.zIndex = '7000';
    const rect: DOMRect = input.getBoundingClientRect();
    div.style.top = (rect.top + window.scrollY) + 'px';
    div.style.left = (rect.left + window.scrollX) + 'px';

    return div;
}

function findNextTextNode(root: Node | null, previous: Node | null): Node | null {
    if (root === null) {
        return null;
    }
    let nodeIterator: NodeIterator = document.createNodeIterator(root, NodeFilter.SHOW_TEXT, null);
    let node: Node | null = nodeIterator.nextNode();
    while (node !== previous) {
        node = nodeIterator.nextNode();
        if (node === null) {
            return findNextTextNode(root.parentNode, previous);
        }
    }
    let result: Node | null = nodeIterator.nextNode();
    if (result !== null) {
        return result;
    } else {
        return findNextTextNode(root.parentNode, previous);
    }
}

function findPreviousTextNode(root: Node | null, previous: Node | null): Node | null {
    if (root === null) {
        return null;
    }
    let nodeIterator: NodeIterator = document.createNodeIterator(root, NodeFilter.SHOW_TEXT, null);
    let node: Node | null = nodeIterator.nextNode();
    while (node !== previous) {
        node = nodeIterator.nextNode();
        if (node === null) {
            return findPreviousTextNode(root.parentNode, previous);
        }
    }
    nodeIterator.previousNode();
    let result: Node | null = nodeIterator.previousNode();
    if (result !== null) {
        return result;
    } else {
        return findPreviousTextNode(root.parentNode, previous);
    }
}

function copyToClipboard(data: string): void {
    navigator.clipboard.writeText(data).then(() => {
        showPopup('Copied to clipboard');
    });
}

function makeHtml(result: MultiDictSearchResult, showToneColors: boolean): string {

    let html = '';
    let texts: string[][] = [];

    if (result === null) return '';

    for (let i = 0; i < result.results.length; ++i) {
        const entry: DictionaryResult = result.results[i];

        if (entry.source === 'cedict') {
            html += makeCedictHtml(entry, i, result, showToneColors, texts);
        } else if (entry.source === 'taigi') {
            html += makeTaigiHtml(entry, i, texts);
        }
    }

    if (result.more) {
        html += '&hellip;<br/>';
    }

    savedSearchResults = texts as string[][] & { grammar?: MultiDictSearchResult['grammar']; vocab?: MultiDictSearchResult['vocab'] };
    savedSearchResults.grammar = result.grammar;
    savedSearchResults.vocab = result.vocab;

    return html;
}

/** Render a CEDICT entry in the popup */
function makeCedictHtml(entry: DictionaryResult, index: number, result: MultiDictSearchResult, showToneColors: boolean, texts: string[][]): string {
    let html = '';
    let hanziClass = 'w-hanzi';
    if (config.fontSize === 'small') {
        hanziClass += '-small';
    }

    // Hanzi
    if (config.simpTrad === 'auto') {
        html += '<span class="' + hanziClass + '">' + entry.headword + '</span>&nbsp;';
    } else {
        html += '<span class="' + hanziClass + '">' + entry.headword + '</span>&nbsp;';
        if (entry.traditional && entry.traditional !== entry.headword) {
            html += '<span class="' + hanziClass + '">' + entry.traditional + '</span>&nbsp;';
        }
    }

    // Pinyin
    let pinyinClass = 'w-pinyin';
    if (config.fontSize === 'small') {
        pinyinClass += '-small';
    }
    let p: [string, string, string] = pinyinAndZhuyin(entry.reading, showToneColors, pinyinClass);
    html += p[0];

    // Zhuyin
    if (config.zhuyin) {
        html += '<br>' + p[2];
    }

    // Definition
    let defClass = 'w-def';
    if (config.fontSize === 'small') {
        defClass += '-small';
    }
    let translation: string = entry.definitions.map(d => d.def).join(' ◆ ');
    html += '<br><span class="' + defClass + '">' + translation + '</span><br>';

    let addFinalBr: boolean = false;

    // Grammar
    if (config.grammar && result.grammar && result.grammar.index === index) {
        html += '<br><span class="grammar">Press "g" for grammar and usage notes.</span><br>';
        addFinalBr = true;
    }

    // Vocab
    if (config.vocab && result.vocab && result.vocab.index === index) {
        html += '<br><span class="vocab">Press "v" for vocabulary notes.</span><br>';
        addFinalBr = true;
    }

    if (addFinalBr) {
        html += '<br>';
    }

    // Store for clipboard: [simplified, traditional, pinyin_text, translation, raw_pinyin]
    texts[index] = [entry.headword, entry.traditional || entry.headword, p[1], translation, entry.reading];

    return html;
}

/** Render a Taigi entry in the popup */
function makeTaigiHtml(entry: DictionaryResult, index: number, texts: string[][]): string {
    let html = '';
    let hanziClass = 'w-hanzi';
    if (config.fontSize === 'small') {
        hanziClass += '-small';
    }

    // Headword
    html += '<span class="' + hanziClass + '">' + entry.headword + '</span>&nbsp;';

    // Reading type badge (白/文/替/俗)
    if (entry.readingType) {
        const colors: Record<string, string> = { '白': 'green', '文': 'blue', '替': 'gray', '俗': 'orange' };
        const color = colors[entry.readingType] || 'gray';
        html += '<span style="color:' + color + ';font-weight:bold;font-size:0.8em;">' + entry.readingType + '</span>&nbsp;';
    }

    // Tai-lo reading
    let pinyinClass = 'w-pinyin';
    if (config.fontSize === 'small') {
        pinyinClass += '-small';
    }
    html += '<span class="' + pinyinClass + '">' + entry.reading + '</span>';

    // Definitions
    let defClass = 'w-def';
    if (config.fontSize === 'small') {
        defClass += '-small';
    }

    for (const def of entry.definitions) {
        let defHtml = '';
        if (def.type) {
            defHtml += '<b>【' + def.type + '】</b>';
        }
        defHtml += def.def;
        html += '<br><span class="' + defClass + '">' + defHtml + '</span>';

        // Examples
        if (def.examples) {
            for (const ex of def.examples) {
                html += '<br><span class="' + defClass + '" style="margin-left:1em;font-size:0.9em;">';
                html += ex.text;
                if (ex.reading) {
                    html += ' <i>' + ex.reading + '</i>';
                }
                if (ex.translation) {
                    html += ' <span style="color:gray;">' + ex.translation + '</span>';
                }
                html += '</span>';
            }
        }
    }
    html += '<br>';

    // Store for clipboard: [simplified, traditional, reading, definition, raw_reading]
    const translation = entry.definitions.map(d => (d.type ? '【' + d.type + '】' : '') + d.def).join('; ');
    texts[index] = [entry.headword, entry.headword, entry.reading, translation, entry.reading];

    return html;
}


let tones: Record<number, string> = {
    1: '&#772;',
    2: '&#769;',
    3: '&#780;',
    4: '&#768;',
    5: ''
};

let utones: Record<number, string> = {
    1: '\u0304',
    2: '\u0301',
    3: '\u030C',
    4: '\u0300',
    5: ''
};

function parse(s: string): RegExpMatchArray | null {
    return s.match(/([^AEIOU:aeiou]*)([AEIOUaeiou:]+)([^aeiou:]*)([1-5])/);
}

function tonify(vowels: string, tone: number): [string, string] {
    let html = '';
    let text = '';

    if (vowels === 'ou') {
        html = 'o' + tones[tone] + 'u';
        text = 'o' + utones[tone] + 'u';
    } else {
        let tonified: boolean = false;
        for (let i = 0; i < vowels.length; i++) {
            let c: string = vowels.charAt(i);
            html += c;
            text += c;
            if (c === 'a' || c === 'e') {
                html += tones[tone];
                text += utones[tone];
                tonified = true;
            } else if (i === vowels.length - 1 && !tonified) {
                html += tones[tone];
                text += utones[tone];
                tonified = true;
            }
        }
        html = html.replace(/u:/, '&uuml;');
        text = text.replace(/u:/, '\u00FC');
    }

    return [html, text];
}

function pinyinAndZhuyin(syllables: string, showToneColors: boolean, pinyinClass: string): [string, string, string] {
    let text = '';
    let html = '';
    let zhuyin = '';
    let a: string[] = syllables.split(/[\s·]+/);
    for (let i = 0; i < a.length; i++) {
        let syllable: string = a[i];

        // ',' in pinyin
        if (syllable === ',') {
            html += ' ,';
            text += ' ,';
            continue;
        }

        if (i > 0) {
            html += '&nbsp;';
            text += ' ';
            zhuyin += '&nbsp;';
        }
        if (syllable === 'r5') {
            if (showToneColors) {
                html += '<span class="' + pinyinClass + ' tone5">r</span>';
            } else {
                html += '<span class="' + pinyinClass + '">r</span>';
            }
            text += 'r';
            continue;
        }
        if (syllable === 'xx5') {
            if (showToneColors) {
                html += '<span class="' + pinyinClass + ' tone5">??</span>';
            } else {
                html += '<span class="' + pinyinClass + '">??</span>';
            }
            text += '??';
            continue;
        }
        let m: RegExpMatchArray | null = parse(syllable);
        if (showToneColors) {
            html += '<span class="' + pinyinClass + ' tone' + m![4] + '">';
        } else {
            html += '<span class="' + pinyinClass + '">';
        }
        let t: [string, string] = tonify(m![2], parseInt(m![4], 10));
        html += m![1] + t[0] + m![3];
        html += '</span>';
        text += m![1] + t[1] + m![3];

        let zhuyinClass = 'w-zhuyin';
        if (config.fontSize === 'small') {
            zhuyinClass += '-small';
        }

        zhuyin += '<span class="tone' + m![4] + ' ' + zhuyinClass + '">'
            + numericPinyin2Zhuyin(syllable) + '</span>';
    }
    return [html, text, zhuyin];
}

let miniHelp: string = `
    <span style="font-weight: bold;">Zhongwen Chinese-English Dictionary</span><br><br>
    <p>Keyboard shortcuts:<p>
    <table style="margin: 10px;" cellspacing=5 cellpadding=5>
    <tr><td><b>n&nbsp;:</b></td><td>&nbsp;Next word</td></tr>
    <tr><td><b>b&nbsp;:</b></td><td>&nbsp;Previous character</td></tr>
    <tr><td><b>m&nbsp;:</b></td><td>&nbsp;Next character</td></tr>
    <tr><td><b>&nbsp;</b></td><td>&nbsp;</td></tr>
    <tr><td><b>a&nbsp;:</b></td><td>&nbsp;Alternate pop-up location</td></tr>
    <tr><td><b>y&nbsp;:</b></td><td>&nbsp;Move pop-up location down</td></tr>
    <tr><td><b>x&nbsp;:</b></td><td>&nbsp;Move pop-up location up</td></tr>
    <tr><td><b>&nbsp;</b></td><td>&nbsp;</td></tr>
    <tr><td><b>c&nbsp;:</b></td><td>&nbsp;Copy translation to clipboard</td></tr>
    <tr><td><b>&nbsp;</b></td><td>&nbsp;</td></tr>
    <tr><td><b>r&nbsp;:</b></td><td>&nbsp;Remember word by adding it to the built-in word list</td></tr>
    <tr><td><b>&nbsp;</b></td><td>&nbsp;</td></tr>
    <tr><td><b>Alt w&nbsp;:</b></td><td>&nbsp;Show the built-in word list in a new tab</td></tr>
    <tr><td><b>&nbsp;</b></td><td>&nbsp;</td></tr>
    <tr><td><b>s&nbsp;:</b></td><td>&nbsp;Add word to Skritter queue</td></tr>
    <tr><td><b>&nbsp;</b></td><td>&nbsp;</td></tr>
    </table>
    Look up selected text in online resources:
    <table style="margin: 10px;" cellspacing=5 cellpadding=5>
    <tr><td><b>&nbsp;</b></td><td>&nbsp;</td></tr>
    <tr><td><b>Alt + 1 :</b></td><td>&nbsp;LINE Dict</td></tr>
    <tr><td><b>Alt + 2 :</b></td><td>&nbsp;Forvo</td></tr>
    <tr><td><b>Alt + 3 :</b></td><td>&nbsp;Dict.cn</td></tr>
    <tr><td><b>Alt + 4&nbsp;:</b></td><td>&nbsp;iCIBA</td></tr>
    <tr><td><b>Alt + 5&nbsp;:</b></td><td>&nbsp;MDBG</td></tr>
    <tr><td><b>Alt + 6&nbsp;:</b></td><td>&nbsp;Reverso</td></tr>
    <tr><td><b>Alt + 7&nbsp;:</b></td><td>&nbsp;MoE Dict</td></tr>
    <tr><td><b>&nbsp;</b></td><td>&nbsp;</td></tr>
    <tr><td><b>t&nbsp;:</b></td><td>&nbsp;Tatoeba</td></tr>
    </table>`;

// event listener
chrome.runtime.onMessage.addListener(
    function (request: { type: string; text?: string; isHelp?: boolean }) {
        switch (request.type) {
            case 'enable':
                enableTab();
                break;
            case 'disable':
                disableTab();
                break;
            case 'showPopup':
                if (!request.isHelp || window === window.top) {
                    showPopup(request.text!);
                }
                break;
            case 'showHelp':
                showPopup(miniHelp);
                break;
            default:
        }
    });
