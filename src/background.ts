/*
 Zhongwen - A Chinese-English Pop-Up Dictionary
 Copyright (C) 2023 Christian Schiller
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

import { DictionaryManager } from './dictionaries/manager';
import { getConfig, loadConfig } from './shared/config';
import type { ZhongwenConfig, MultiDictSearchResult, WordListEntry } from './shared/types';

let config: ZhongwenConfig = getConfig();

let dictManager = new DictionaryManager();

chrome.runtime.onInstalled.addListener((): void => {

    chrome.contextMenus.create(
        {
            id: 'wordlistMenuItem',
            title: 'Open word list'
        }, () => {
            if (chrome.runtime.lastError) {
                // ignore
            }
        }
    );

    chrome.contextMenus.create(
        {
            id: 'helpMenuItem',
            title: 'Show help in new tab'
        }, () => {
            if (chrome.runtime.lastError) {
                // ignore
            }
        }
    );
});

chrome.contextMenus.onClicked.addListener(wordlistMenuItemListener);

chrome.contextMenus.onClicked.addListener(helpMenuItemListener);

function wordlistMenuItemListener({menuItemId}: chrome.contextMenus.OnClickData): void {

    chrome.storage.session.get('tabIDs', ({tabIDs = {}}) => {
        if (menuItemId === 'wordlistMenuItem') {
            let url = '/wordlist.html';
            let tabID = tabIDs['wordlist'];
            if (tabID) {
                chrome.tabs.get(tabID, function (tab: chrome.tabs.Tab) {
                    if (!chrome.runtime.lastError && tab && tab.url && (tab.url.endsWith('wordlist.html'))) {
                        chrome.tabs.update(tabID!, {
                            active: true
                        });
                    } else {
                        chrome.tabs.create({
                            url: url
                        }, function (tab: chrome.tabs.Tab) {
                            tabIDs['wordlist'] = tab.id!;
                            chrome.storage.session.set({tabIDs});
                        });
                    }
                });
            } else {
                chrome.tabs.create(
                    {url: url},
                    function (tab: chrome.tabs.Tab) {
                        tabIDs['wordlist'] = tab.id!;
                        chrome.storage.session.set({tabIDs});
                    }
                );
            }
        }
    });
}

function helpMenuItemListener({menuItemId}: chrome.contextMenus.OnClickData): void {

    chrome.storage.session.get('tabIDs', ({tabIDs = {}}) => {
        if (menuItemId === 'helpMenuItem') {
            let url = '/help.html';
            let tabID = tabIDs['help'];
            if (tabID) {
                chrome.tabs.get(tabID, function (tab: chrome.tabs.Tab) {
                    if (!chrome.runtime.lastError && tab && (tab.url!.endsWith('help.html'))) {
                        chrome.tabs.update(tabID!, {
                            active: true
                        });
                    } else {
                        chrome.tabs.create({
                            url: url
                        }, function (tab: chrome.tabs.Tab) {
                            tabIDs['help'] = tab.id!;
                            chrome.storage.session.set({tabIDs});
                        });
                    }
                });
            } else {
                chrome.tabs.create(
                    {url: url},
                    function (tab: chrome.tabs.Tab) {
                        tabIDs['help'] = tab.id!;
                        chrome.storage.session.set({tabIDs});
                    }
                );
            }
        }
    });
}

chrome.action.onClicked.addListener(activateExtensionToggle);

function activateExtensionToggle(currentTab: chrome.tabs.Tab): void {
    chrome.storage.local.get('isActive', ({isActive}: { isActive?: boolean }) => {
        isActive ? deactivateExtension() : activateExtension(currentTab.id!);
    });
}

function activateExtension(tabId: number): void {

    chrome.storage.local.set({isActive: true});

    enableTab(tabId);

    showActiveBadge();

    showHelpMenu(tabId);
}

function enableTab(tabId: number): void {
    chrome.tabs.sendMessage(tabId, {
        'type': 'enable'
    }, () => {
        if (chrome.runtime.lastError) {
            // ignore
        }
    });
}

function showActiveBadge(): void {
    chrome.action.setBadgeBackgroundColor({
        'color': [255, 0, 0, 255]
    });

    chrome.action.setBadgeText({
        'text': 'On'
    });
}

function showHelpMenu(tabId: number): void {
    chrome.tabs.sendMessage(tabId, {
        'type': 'showHelp'
    }, () => {
        if (chrome.runtime.lastError) {
            // ignore
        }
    });
}

function deactivateExtension(): void {

    chrome.storage.local.set({isActive: false});

    dictManager.deactivate();

    showInactiveBadge();

    disableAllTabs();
}

function showInactiveBadge(): void {
    chrome.action.setBadgeBackgroundColor({
        'color': [0, 0, 0, 0]
    });

    chrome.action.setBadgeText({
        'text': ''
    });
}

function disableAllTabs(): void {
    chrome.windows.getAll(
        { 'populate': true },
        function (windows: chrome.windows.Window[]) {
            for (let i = 0; i < windows.length; ++i) {
                let tabs = windows[i].tabs!;
                for (let j = 0; j < tabs.length; ++j) {
                    chrome.tabs.sendMessage(tabs[j].id!, {
                        'type': 'disable'
                    }, () => {
                        if (chrome.runtime.lastError) {
                            // ignore
                        }
                    });
                }
            }
        }
    );
}

chrome.runtime.onMessage.addListener(function (
    message: { type: string; text?: string },
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: MultiDictSearchResult | undefined) => void
): boolean | undefined {

    if (message.type === 'search') {

        search(message.text!).then(response => {
            sendResponse(response ?? undefined);
        });

        return true;
    }

    return undefined;
});

// Dictionary management messages (from options page)
chrome.runtime.onMessage.addListener(function (
    message: { type: string },
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void
): boolean | undefined {

    if (message.type === 'getDictStatus') {
        dictManager.getDictStatus().then(status => {
            sendResponse(status);
        });
        return true;
    }

    if (message.type === 'refreshDict') {
        dictManager.refreshDictionaries().then(() =>
            dictManager.getDictStatus().then(status => {
                sendResponse({ success: true, status });
            }).catch(err => {
                sendResponse({ success: false, error: String(err) });
            })
        );
        return true;
    }

    return undefined;
});

async function search(text: string): Promise<MultiDictSearchResult | null> {
    if (!dictManager.loaded) {
			  await loadConfig();
        await dictManager.loadDictionaries(config.enabledDicts);
    }

    return dictManager.search(text);
}

// Rebuild the dictionary manager when dictionary-related settings change
const DICT_CONFIG_KEYS = ['enabledDicts'];
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    const changedKeys = Object.keys(changes);
    if (changedKeys.some(k => DICT_CONFIG_KEYS.includes(k))) {
        console.log('[Zhongwen] Dictionary config changed, rebuilding manager...');
        dictManager.deactivate();
    }
});

chrome.tabs.onActivated.addListener((activeInfo: chrome.tabs.TabActiveInfo): void => {

    chrome.storage.session.get('tabIDs', ({tabIDs = {}}) => {
        if (activeInfo.tabId === tabIDs['wordlist']) {
            chrome.tabs.reload(activeInfo.tabId);
        } else if (activeInfo.tabId !== tabIDs['help']) {
            enableTabIfActive(activeInfo.tabId);
        }
    });
});

chrome.tabs.onUpdated.addListener(function (tabId: number, changeInfo: chrome.tabs.TabChangeInfo): void {

    chrome.storage.session.get('tabIDs', ({tabIDs = {}}) => {
        if (changeInfo.status === 'complete' && tabId !== tabIDs['help'] && tabId !== tabIDs['wordlist']) {
            enableTabIfActive(tabId);
        }
    });
});


function enableTabIfActive(tabId: number): void {

    chrome.storage.local.get('isActive', ({isActive}: { isActive?: boolean }) => {
        if (isActive) {
            enableTab(tabId);
            showActiveBadge();
        }
    });
}

chrome.runtime.onMessage.addListener(function (
    message: { type: string; url?: string; tabType?: string }
): void {

    if (message.type === 'open') {
        chrome.storage.session.get('tabIDs', ({tabIDs = {}}) => {
            let tabID = tabIDs[message.tabType!];
            if (tabID) {
                chrome.tabs.get(tabID, () => {
                    if (!chrome.runtime.lastError) {
                        // activate existing tab
                        chrome.tabs.update(tabID!, {active: true, url: message.url});
                    } else {
                        createTab(message.url!, message.tabType!);
                    }
                });
            } else {
                createTab(message.url!, message.tabType!);
            }
        });
    }
});

function createTab(url: string, tabType: string): void {

    chrome.storage.session.get('tabIDs', ({tabIDs = {}}) => {
        chrome.tabs.create({url}, (tab: chrome.tabs.Tab) => {
            tabIDs[tabType] = tab.id!;
            chrome.storage.session.set({tabIDs});
        });
    });
}

chrome.runtime.onMessage.addListener(function (
    message: { type: string; entries?: Array<{ simplified: string; traditional: string; pinyin: string; definition: string }> }
): void {

    if (message.type === 'add') {
        chrome.storage.local.get(['wordList', 'saveToWordList'], (data: { wordList?: WordListEntry[]; saveToWordList?: string }) => {

            let wordList: WordListEntry[] = data.wordList || [];

            let saveToWordList: string = data.saveToWordList || config.saveToWordList;

            for (let i in message.entries!) {

                let entry: WordListEntry = {} as WordListEntry;
                entry.timestamp = Date.now();
                entry.simplified = message.entries![i].simplified;
                entry.traditional = message.entries![i].traditional;
                entry.pinyin = message.entries![i].pinyin;
                entry.definition = message.entries![i].definition;

                wordList.push(entry);

                if (saveToWordList === 'firstEntryOnly') {
                    break;
                }
            }

            chrome.storage.local.set({wordList});
        });
    }
});
