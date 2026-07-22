/*
 Zhongwen - A Chinese-English Pop-Up Dictionary
 Copyright (C) 2022 Christian Schiller
 https://chrome.google.com/extensions/detail/kkmlkkjojmombglmlpbpapmhcaljjkde
 */

// @ts-nocheck

import { defaultConfig } from './shared/config';
import type { ZhongwenConfig } from './shared/types';

let config: ZhongwenConfig = { ...defaultConfig };

chrome.storage.local.get(null, storedConfig => {
    if (storedConfig) {
        Object.entries(storedConfig).forEach(e => config[e[0]] = e[1]);
    }

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

function setOption(option: string, value: string) {
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
