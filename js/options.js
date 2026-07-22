/*
 Zhongwen - A Chinese-English Pop-Up Dictionary
 Copyright (C) 2022 Christian Schiller
 https://chrome.google.com/extensions/detail/kkmlkkjojmombglmlpbpapmhcaljjkde
 */

/* global globalThis */

'use strict';

let config = globalThis.defaultConfig;

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

    loadDictStatus();
}

function loadDictStatus() {
    const section = document.querySelector('#dictStatusSection');

    // Show loading state
    section.innerHTML = '<p class="text-muted">Checking dictionary status...</p>';

    chrome.runtime.sendMessage({ type: 'getDictStatus' }, (status) => {
        renderDictStatus(section, status);
    });
}

function renderDictStatus(section, status) {
    let html = '';

    if (status && status.hasCachedDict) {
        const date = new Date(status.cachedTimestamp).toLocaleString();
        html += `
            <p><strong>Source:</strong> Downloaded from MDBG</p>
            <p><strong>Last updated:</strong> ${date}</p>
            <p><strong>Entries:</strong> ~${status.entryCount.toLocaleString()}</p>
        `;
    } else {
        html += `
            <p><strong>Source:</strong> Bundled with extension</p>
            <p class="text-muted">No downloaded dictionary cached. Click the button below to download the latest version from MDBG.</p>
        `;
    }

    html += `
        <button id="refreshDictBtn" class="btn btn-primary btn-sm mt-2">
            ${status && status.hasCachedDict ? 'Check for updates' : 'Download latest CEDICT'}
        </button>
        <span id="refreshDictStatus" class="ml-2 text-muted small"></span>
    `;

    section.innerHTML = html;

    // Attach refresh button handler
    const btn = document.querySelector('#refreshDictBtn');
    const statusSpan = document.querySelector('#refreshDictStatus');

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
                const errorMsg = response.error || 'Unknown error';
                statusSpan.textContent = '✗ Update failed: ' + errorMsg;
                statusSpan.className = 'ml-2 text-danger small';
                btn.disabled = false;
                btn.textContent = 'Retry';
            }
        });
    });
}

function setPopupColor(popupColor) {
    setOption('background', popupColor);
}

function setToneColorScheme(toneColorScheme) {
    if (toneColorScheme === 'none') {
        setOption('toneColors', false);
    } else {
        setOption('toneColors', true);
        setOption('toneColorScheme', toneColorScheme);
    }
}

function setOption(option, value) {
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
});

