/*
 Zhongwen - A Chinese-English Pop-Up Dictionary
 Copyright (C) 2022 Christian Schiller
 https://chrome.google.com/extensions/detail/kkmlkkjojmombglmlpbpapmhcaljjkde
 */

// @ts-nocheck

import { getConfig, loadConfig } from './shared/config';
import type { ZhongwenConfig } from './shared/types';
import { ALL_DICTIONARIES } from './dictionaries/manager';

let config: ZhongwenConfig = getConfig();

loadConfig(() => {
    loadVals();
});

function loadVals() {

    document.querySelector(`input[name="background"][value="${config.background}"]`).checked = true;

    if (!config.toneColors) {
        document.querySelector('#toneColorsNone').checked = true;
    } else {
        document.querySelector(`input[name="toneColors"][value="${config.toneColorScheme}"]`).checked = true;
    }

    document.querySelector(`input[name="fontSize"][value="${config.fontSize}"]`).checked = true;

    document.querySelector(`input[name="simpTrad"][value="${config.simpTrad}"]`).checked = true;

    document.querySelector('#zhuyin').checked = config.zhuyin;

    document.querySelector('#grammar').checked = config.grammar;

    document.querySelector('#vocab').checked = config.vocab;

    document.querySelector(`input[name="saveToWordList"][value="${config.saveToWordList}"]`).checked = true;

    document.querySelector(`input[name="skritterTLD"][value="${config.skritterTLD}"]`).checked = true;

    document.querySelector('#ttsEnabled').checked = config.ttsEnabled;

    // Clipboard format
    loadClipboardFormat();

    // Dictionary enable/order
    loadDictOrder();

    // Dictionary status
    loadDictStatus();
}

function loadClipboardFormat() {
    const section = document.querySelector('#clipboardFormatSection')!;
    const format = config.clipboardFormat;

    // Predefined format presets: add/remove/reorder here to update the options page
    const presets = [
        {
            id: 'clipboardFormatFull',
            label: 'Full entry (tab-separated)',
            value: '{simplified}\t{traditional}\t{pinyin}\t{definition}',
        },
        {
            id: 'clipboardFormatSimplifiedPinyinDef',
            label: 'Simplified only',
            value: '{simplified}\t{pinyin}\t{definition}',
        },
        {
            id: 'clipboardFormatTraditionalPinyinDef',
            label: 'Traditional only',
            value: '{traditional}\t{pinyin}\t{definition}',
        },
        {
            id: 'clipboardFormatHanziPinyin',
            label: 'Hanzi + Pinyin',
            value: '{simplified} {pinyin}',
        },
    ];

    // Build the section HTML
    let html = '';

    // Render preset radio buttons
    const matchesPreset = presets.some(p => p.value === format);
    for (const preset of presets) {
        const checked = preset.value === format ? 'checked' : '';
        const escapedValue = preset.value.replace(/"/g, '&quot;');
        html += `
            <div class="custom-control custom-radio">
                <input type="radio" id="${preset.id}" name="clipboardFormat"
                       class="custom-control-input" value="${escapedValue}" ${checked}>
                <label class="custom-control-label" for="${preset.id}">
                    ${preset.label}: <code>${preset.value}</code>
                </label>
            </div>
        `;
    }

    // Custom format radio + text input
    const escapedFormat = format.replace(/"/g, '&quot;');
    html += `
        <div class="custom-control custom-radio">
            <input type="radio" id="clipboardFormatCustom" name="clipboardFormat"
                   class="custom-control-input" value="custom" ${!matchesPreset ? 'checked' : ''}>
            <label class="custom-control-label" for="clipboardFormatCustom">Custom format:</label>
        </div>
        <input type="text" class="form-control mt-2" id="clipboardFormatCustomInput"
               placeholder="{simplified} {pinyin} - {definition}"
               value="${!matchesPreset ? escapedFormat : ''}"
               style="max-width: 500px; font-family: monospace;">
        <small class="form-text text-muted">Use <code>\\t</code> for tab and <code>\\n</code> for newline.</small>
    `;

    section.innerHTML += html;

    // Attach event listeners to dynamically created elements

    // Preset radio buttons
    section.querySelectorAll('input[name="clipboardFormat"]').forEach((input) => {
        input.addEventListener('change', () => {
            const value = (input as HTMLInputElement).value;
            if (value === 'custom') {
                const customInput = section.querySelector('#clipboardFormatCustomInput') as HTMLInputElement;
                if (customInput.value) {
                    setOption('clipboardFormat', customInput.value);
                }
            } else {
                setOption('clipboardFormat', value);
            }
        });
    });

    // Custom text input: auto-selects "Custom" radio when typed into
    const customInput = section.querySelector('#clipboardFormatCustomInput') as HTMLInputElement;
    customInput.addEventListener('input', () => {
        const customRadio = section.querySelector('#clipboardFormatCustom') as HTMLInputElement;
        customRadio.checked = true;
        if (customInput.value) {
            setOption('clipboardFormat', customInput.value);
        }
    });
}

function loadDictOrder() {
    const section = document.querySelector('#dictOrderSection')!;

    const enabledDicts: string[] = config.enabledDicts;

    // Sort: enabled dicts first (in their order), then disabled ones
    const sorted = [...ALL_DICTIONARIES].sort((a, b) => {
        const ai = enabledDicts.indexOf(a.id);
        const bi = enabledDicts.indexOf(b.id);
        // enabled items sort by their position; disabled items go to the end
        const aPos = ai === -1 ? 999 : ai;
        const bPos = bi === -1 ? 999 : bi;
        return aPos - bPos;
    });

    function render() {
        let html = '<label>Enabled dictionaries (drag to reorder — top = shown first in popup)</label>';
        html += '<ul id="dictOrderList" style="list-style:none;padding:0;">';
        for (const dict of sorted) {
            const enabled = enabledDicts.includes(dict.id);
            html += `
                <li data-id="${dict.id}" style="padding:6px 10px;margin:4px 0;border:1px solid #ddd;border-radius:4px;cursor:grab;background:#f8f9fa;display:flex;align-items:center;">
                    <span style="margin-right:10px;cursor:grab;">☰</span>
                    <input type="checkbox" id="dict_${dict.id}" ${enabled ? 'checked' : ''}
                           style="margin-right:8px;">
                    <label for="dict_${dict.id}" style="margin:0;cursor:pointer;">${dict.label}</label>
                </li>
            `;
        }
        html += '</ul>';
        html += '<small class="form-text text-muted">Check to enable. Drag to reorder. Top dictionary results appear first in the popup.</small>';
        section.innerHTML = html;

        attachDictOrderListeners();
    }

    function saveEnabledDicts() {
        // Read current order and checked state from the DOM
        const list = document.querySelector('#dictOrderList') as HTMLUListElement;
        const items = [...list.querySelectorAll('li')];
        const newEnabledDicts: string[] = [];
        for (const item of items) {
            const id = item.getAttribute('data-id')!;
            const checkbox = item.querySelector('input[type="checkbox"]') as HTMLInputElement;
            if (checkbox.checked) {
                newEnabledDicts.push(id);
            }
        }
        setOption('enabledDicts', newEnabledDicts);
    }

    function attachDictOrderListeners() {
        const list = document.querySelector('#dictOrderList') as HTMLUListElement;
        let draggedItem: HTMLLIElement | null = null;

        // Checkbox change listeners
        list.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
            checkbox.addEventListener('change', saveEnabledDicts);
        });

        // Drag-and-drop reordering
        list.querySelectorAll('li').forEach((li) => {
            li.setAttribute('draggable', 'true');

            li.addEventListener('dragstart', (e) => {
                draggedItem = li as HTMLLIElement;
                (li as HTMLElement).style.opacity = '0.5';
                (e as DragEvent).dataTransfer!.effectAllowed = 'move';
            });

            li.addEventListener('dragend', () => {
                (li as HTMLElement).style.opacity = '1';
                draggedItem = null;
            });

            li.addEventListener('dragover', (e) => {
                e.preventDefault();
                (e as DragEvent).dataTransfer!.dropEffect = 'move';
            });

            li.addEventListener('drop', (e) => {
                e.preventDefault();
                if (draggedItem && draggedItem !== li) {
                    const items = [...list.querySelectorAll('li')];
                    const draggedIdx = items.indexOf(draggedItem);
                    const targetIdx = items.indexOf(li as HTMLLIElement);
                    if (draggedIdx < targetIdx) {
                        list.insertBefore(draggedItem, li.nextSibling);
                    } else {
                        list.insertBefore(draggedItem, li);
                    }
                    saveEnabledDicts();
                }
            });
        });
    }

    render();
}

function loadDictStatus() {
    const section = document.querySelector('#dictStatusSection')!;

    // Show loading state
    section.innerHTML = '<p class="text-muted">Checking dictionary status...</p>';

    chrome.runtime.sendMessage({ type: 'getDictStatus' }, (status) => {
        renderDictStatus(section, status);
    });
}

function renderDictStatus(section: Element, status: { hasCachedDict: boolean; cachedTimestamp: number | null; entryCount: number | null }) {
    let html = '<h4>CEDICT Dictionary</h4>';

    if (status && status.hasCachedDict) {
        const date = new Date(status.cachedTimestamp!).toLocaleString();
        html += `
            <p><strong>Source:</strong> Downloaded from MDBG</p>
            <p><strong>Last updated:</strong> ${date}</p>
            <p><strong>Entries:</strong> ~${status.entryCount!.toLocaleString()}</p>
        `;
    } else {
        html += `
            <p><strong>Source:</strong> Bundled with extension</p>
            <p class="text-muted">No downloaded dictionary cached. Click the button below to download the latest version from MDBG.</p>
        `;
    }

    html += `
        <button id="refreshDictBtn" class="btn btn-primary btn-sm mt-2">
            ${status && status.hasCachedDict ? 'Check for CEDICT updates' : 'Download latest CEDICT'}
        </button>
        <span id="refreshDictStatus" class="ml-2 text-muted small"></span>
    `;

    section.innerHTML = html;

    // Attach refresh button handler
    const btn = document.querySelector('#refreshDictBtn') as HTMLButtonElement;
    const statusSpan = document.querySelector('#refreshDictStatus') as HTMLSpanElement;

    btn.addEventListener('click', () => {
        btn.disabled = true;
        btn.textContent = 'Downloading...';
        statusSpan.textContent = '';

        chrome.runtime.sendMessage({ type: 'refreshDict' }, (response) => {
            if (response && response.success) {
                statusSpan.textContent = '✓ Dictionary updated successfully!';
                statusSpan.className = 'ml-2 text-success small';
                // Re-render with new status
                renderDictStatus(section, response.status);
            } else {
                const errorMsg = response?.error || 'Unknown error';
                statusSpan.textContent = '✗ Update failed: ' + errorMsg;
                statusSpan.className = 'ml-2 text-danger small';
                btn.disabled = false;
                btn.textContent = 'Retry';
            }
        });
    });
}

function setPopupColor(popupColor: string) {
    setOption('background', popupColor);
}

function setToneColorScheme(toneColorScheme: string) {
    if (toneColorScheme === 'none') {
        setOption('toneColors', false);
    } else {
        setOption('toneColors', true);
        setOption('toneColorScheme', toneColorScheme);
    }
}

function setOption(option: string, value: unknown) {
    chrome.storage.local.set({[option]: value});
}

window.addEventListener('load', () => {

    document.querySelectorAll('input[name="background"]').forEach((input) => {
        input.addEventListener('change',
            () => setPopupColor(input.getAttribute('value')));
    });

    document.querySelectorAll('input[name="toneColors"]').forEach((input) => {
        input.addEventListener('change',
            () => setToneColorScheme(input.getAttribute('value')));
    });

    document.querySelectorAll('input[name="fontSize"]').forEach((input) => {
        input.addEventListener('change',
            () => setOption('fontSize', input.getAttribute('value')));
    });

    document.querySelectorAll('input[name="simpTrad"]').forEach((input) => {
        input.addEventListener('change',
            () => setOption('simpTrad', input.getAttribute('value')));
    });

    document.querySelector('#zhuyin').addEventListener('change',
        (event) => setOption('zhuyin', event.target.checked));

    document.querySelector('#grammar').addEventListener('change',
        (event) => setOption('grammar', event.target.checked));

    document.querySelector('#vocab').addEventListener('change',
        (event) => setOption('vocab', event.target.checked));

    document.querySelectorAll('input[name="saveToWordList"]').forEach((input) => {
        input.addEventListener('change',
            () => setOption('saveToWordList', input.getAttribute('value')));
    });

    document.querySelectorAll('input[name="skritterTLD"]').forEach((input) => {
        input.addEventListener('change',
            () => setOption('skritterTLD', input.getAttribute('value')));
    });

    document.querySelector('#ttsEnabled').addEventListener('change',
        (event) => setOption('ttsEnabled', event.target.checked));
});
