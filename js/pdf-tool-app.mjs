import {
    downloadBytes,
    formatBytes,
    isPdfFile,
    parsePageSelection,
    safePdfFilename,
} from './pdf-utils.mjs';

const app = document.querySelector('#pdf-tool-app');
const mode = app.dataset.mode;
const LOW_MEMORY_DEVICE = Number(navigator.deviceMemory || 8) <= 4;
const MAX_FILE_SIZE = (LOW_MEMORY_DEVICE ? 35 : 50) * 1024 * 1024;
const MAX_TOTAL_SIZE = (LOW_MEMORY_DEVICE ? 70 : 120) * 1024 * 1024;
const MAX_PAGE_COUNT = 2000;
const MAX_OUTPUT_SIZE = 200 * 1024 * 1024;

const configs = {
    merge: { multiple: true, accept: '.pdf,application/pdf', action: 'Merge PDFs', output: 'merged.pdf' },
    extract: { multiple: false, accept: '.pdf,application/pdf', action: 'Extract pages', output: 'extracted-pages.pdf' },
    organize: { multiple: false, accept: '.pdf,application/pdf', action: 'Build organized PDF', output: 'organized.pdf' },
    images: { multiple: true, accept: 'image/png,image/jpeg,.png,.jpg,.jpeg', action: 'Create PDF', output: 'images.pdf', images: true },
    lock: { multiple: false, accept: '.pdf,application/pdf', action: 'Lock PDF', output: 'locked.pdf' },
    unlock: { multiple: false, accept: '.pdf,application/pdf', action: 'Unlock PDF', output: 'unlocked.pdf' },
    metadata: { multiple: false, accept: '.pdf,application/pdf', action: 'Remove metadata', output: 'metadata-cleaned.pdf' },
    watermark: { multiple: false, accept: '.pdf,application/pdf', action: 'Apply to PDF', output: 'watermarked.pdf' },
};
const config = configs[mode];
if (!config) throw new Error(`Unknown PDF tool mode: ${mode}`);

const optionsMarkup = {
    extract: `<div class="pdf-field"><label for="page-ranges">Pages to extract</label><input id="page-ranges" type="text" placeholder="1-3, 5, 8-10"><small>Leave blank to include every page.</small></div>`,
    organize: `<div class="pdf-options-grid"><div class="pdf-field"><label for="page-order">Page order</label><input id="page-order" type="text" placeholder="3, 1-2, 5"><small>Omit pages to remove them.</small></div><div class="pdf-field"><label for="page-rotations">Rotate pages</label><input id="page-rotations" type="text" placeholder="1:90, 3:270"><small>Use original page numbers and 90° increments.</small></div></div>`,
    images: `<div class="pdf-options-grid"><div class="pdf-field"><label for="image-page-size">Page size</label><select id="image-page-size"><option value="fit">Fit each image</option><option value="a4">A4</option><option value="letter">Letter</option></select></div><div class="pdf-field"><label for="image-margin">Margin (points)</label><input id="image-margin" type="number" min="0" max="144" value="24"></div></div>`,
    lock: `<div class="pdf-options-grid"><div class="pdf-field"><label for="pdf-password">Password</label><input id="pdf-password" type="password" minlength="8" maxlength="127" autocomplete="new-password"><small>8–127 UTF-8 bytes; control characters are not supported.</small></div><div class="pdf-field"><label for="pdf-password-confirm">Confirm password</label><input id="pdf-password-confirm" type="password" minlength="8" maxlength="127" autocomplete="new-password"></div></div><p class="pdf-caution">AES-256 encryption. Keep the password somewhere safe; this site cannot recover it.</p>`,
    unlock: `<div class="pdf-field"><label for="pdf-password">Current password</label><input id="pdf-password" type="password" maxlength="127" autocomplete="current-password"><small>The password is used only for this operation and then cleared.</small></div>`,
    metadata: `<p class="pdf-caution">Removes the standard document information dictionary and XMP metadata. It does not redact visible content, annotations, attachments, or text inside the PDF.</p>`,
    watermark: `<div class="pdf-options-grid"><div class="pdf-field"><label for="watermark-text">Watermark text</label><input id="watermark-text" type="text" maxlength="120" placeholder="DRAFT"><small>Latin characters are supported in this browser-only version.</small></div><div class="pdf-field"><label for="watermark-color">Color</label><input id="watermark-color" type="color" value="#6b7280"></div><div class="pdf-field"><label for="watermark-opacity">Opacity</label><input id="watermark-opacity" type="range" min="0.05" max="1" step="0.05" value="0.2"></div><label class="pdf-check"><input id="page-numbers" type="checkbox"> Add page numbers</label></div>`,
};

app.innerHTML = `
    <input id="pdf-file-input" type="file" accept="${config.accept}" ${config.multiple ? 'multiple' : ''} hidden>
    <button id="pdf-drop-zone" class="pdf-drop-zone" type="button">
        <strong>${config.images ? 'Drop JPG or PNG images here' : `Drop ${config.multiple ? 'PDF files' : 'a PDF'} here`}</strong>
        <span>or click to choose · up to ${Math.round(MAX_FILE_SIZE / 1024 / 1024)} MB per file</span>
    </button>
    <div id="pdf-file-list" class="pdf-file-list" hidden></div>
    <div id="pdf-options" class="pdf-options" ${optionsMarkup[mode] ? '' : 'hidden'}>${optionsMarkup[mode] || ''}</div>
    <div class="pdf-action-row">
        <button id="pdf-run" class="primary" type="button" disabled>${config.action}</button>
        <button id="pdf-reset" class="secondary" type="button">Clear</button>
    </div>
    <p id="pdf-tool-status" class="pdf-status" aria-live="polite">Choose ${config.multiple ? 'files' : 'a file'} to begin.</p>
    <section id="pdf-output" class="pdf-output" hidden>
        <div><span>Output ready</span><strong id="pdf-output-size"></strong></div>
        <button id="pdf-download" class="primary" type="button">Download PDF</button>
    </section>`;

const elements = {
    input: app.querySelector('#pdf-file-input'),
    drop: app.querySelector('#pdf-drop-zone'),
    list: app.querySelector('#pdf-file-list'),
    run: app.querySelector('#pdf-run'),
    reset: app.querySelector('#pdf-reset'),
    status: app.querySelector('#pdf-tool-status'),
    output: app.querySelector('#pdf-output'),
    outputSize: app.querySelector('#pdf-output-size'),
    download: app.querySelector('#pdf-download'),
};
let files = [];
let outputBytes = null;
let pageCount = null;
let busy = false;

async function runPdfWorker(workerMode, payload, transfer = []) {
    const worker = new Worker(new URL('./pdf-tool.worker.mjs', import.meta.url), { type: 'module' });
    try {
        return await new Promise((resolve, reject) => {
            const timeout = window.setTimeout(() => reject(new Error('PDF processing timed out. Try smaller files.')), 90000);
            worker.addEventListener('message', ({ data }) => {
                window.clearTimeout(timeout);
                if (data.ok) resolve(data.output);
                else reject(new Error(data.error || 'The PDF could not be processed.'));
            }, { once: true });
            worker.addEventListener('error', (event) => {
                window.clearTimeout(timeout);
                reject(new Error(event.message || 'The local PDF engine could not be loaded.'));
            }, { once: true });
            worker.postMessage({ type: 'run', mode: workerMode, payload }, transfer);
        });
    } finally {
        worker.terminate();
    }
}

function setStatus(message, tone = '') {
    elements.status.textContent = message;
    elements.status.dataset.tone = tone;
}

function setBusy(isBusy) {
    busy = isBusy;
    elements.run.disabled = isBusy || files.length < (config.multiple && !config.images ? 2 : 1);
    elements.reset.disabled = isBusy;
    elements.input.disabled = isBusy;
    elements.drop.disabled = isBusy;
    elements.drop.setAttribute('aria-busy', String(isBusy));
}

function clearPasswords() {
    app.querySelectorAll('input[type="password"]').forEach((input) => { input.value = ''; });
}

function resetOutput() {
    outputBytes = null;
    elements.output.hidden = true;
    elements.outputSize.textContent = '';
}

function reset() {
    files = [];
    pageCount = null;
    elements.input.value = '';
    elements.list.replaceChildren();
    elements.list.hidden = true;
    clearPasswords();
    resetOutput();
    setBusy(false);
    setStatus(`Choose ${config.multiple ? 'files' : 'a file'} to begin.`);
}

function renderFiles(focusIndex = null, announcement = '') {
    elements.list.replaceChildren();
    files.forEach((file, index) => {
        const row = document.createElement('div');
        row.className = 'pdf-file-row';
        row.tabIndex = -1;
        const detail = document.createElement('div');
        const name = document.createElement('strong');
        const size = document.createElement('span');
        name.textContent = file.name;
        size.textContent = formatBytes(file.size);
        detail.append(name, size);
        const actions = document.createElement('div');
        if (config.multiple) {
            for (const [label, offset] of [['↑', -1], ['↓', 1]]) {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'pdf-row-button';
                button.textContent = label;
                button.setAttribute('aria-label', `${offset < 0 ? 'Move up' : 'Move down'} ${file.name}`);
                button.disabled = index + offset < 0 || index + offset >= files.length;
                button.addEventListener('click', () => {
                    const nextIndex = index + offset;
                    [files[index], files[nextIndex]] = [files[nextIndex], files[index]];
                    resetOutput();
                    renderFiles(nextIndex, `${file.name} moved to position ${nextIndex + 1} of ${files.length}.`);
                });
                actions.append(button);
            }
        }
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'pdf-row-button';
        remove.textContent = '×';
        remove.setAttribute('aria-label', `Remove ${file.name}`);
        remove.addEventListener('click', () => {
            const removedName = file.name;
            files.splice(index, 1);
            resetOutput();
            renderFiles(files.length ? Math.min(index, files.length - 1) : null, `${removedName} removed. ${files.length} file${files.length === 1 ? '' : 's'} remaining.`);
            if (!files.length) elements.drop.focus();
        });
        actions.append(remove);
        row.append(detail, actions);
        elements.list.append(row);
    });
    elements.list.hidden = files.length === 0;
    setBusy(false);
    if (announcement) setStatus(announcement, 'success');
    if (focusIndex != null) elements.list.children[focusIndex]?.focus();
}

function imageType(file) {
    if (file.type === 'image/png' || /\.png$/i.test(file.name)) return 'image/png';
    if (file.type === 'image/jpeg' || /\.jpe?g$/i.test(file.name)) return 'image/jpeg';
    return '';
}

async function validateFiles(candidates) {
    const accepted = [];
    for (const file of candidates) {
        if (file.size > MAX_FILE_SIZE) throw new Error(`${file.name} is larger than ${Math.round(MAX_FILE_SIZE / 1024 / 1024)} MB.`);
        if (config.images) {
            if (!imageType(file)) throw new Error(`${file.name} is not a JPG or PNG image.`);
        } else if (!(await isPdfFile(file))) {
            throw new Error(`${file.name} is not a valid PDF file.`);
        }
        accepted.push(file);
    }
    const next = config.multiple ? [...files, ...accepted] : accepted.slice(0, 1);
    if (next.reduce((total, file) => total + file.size, 0) > MAX_TOTAL_SIZE) {
        throw new Error(`The selected files exceed the ${Math.round(MAX_TOTAL_SIZE / 1024 / 1024)} MB combined limit.`);
    }
    return next;
}

async function addFiles(candidates) {
    if (busy) return;
    const previousFiles = files.slice();
    const previousPageCount = pageCount;
    setBusy(true);
    resetOutput();
    try {
        files = await validateFiles([...candidates]);
        if (!config.multiple && files[0]) {
            if (mode === 'unlock') {
                pageCount = null;
                setStatus(`${files[0].name} is ready.`);
            } else {
                setStatus('Reading the PDF locally…');
                const bytes = new Uint8Array(await files[0].arrayBuffer());
                pageCount = await runPdfWorker('count', { bytes }, [bytes.buffer]);
                if (pageCount > MAX_PAGE_COUNT) throw new Error(`This PDF has more than ${MAX_PAGE_COUNT} pages.`);
                setStatus(`${files[0].name} is ready · ${pageCount} page${pageCount === 1 ? '' : 's'}.`);
            }
        } else {
            setStatus(`${files.length} file${files.length === 1 ? '' : 's'} ready.`);
        }
        renderFiles();
    } catch (error) {
        files = previousFiles;
        pageCount = previousPageCount;
        elements.input.value = '';
        renderFiles();
        const message = error instanceof Error ? error.message : String(error);
        setStatus(/encrypted/i.test(message) ? 'This PDF is encrypted. Unlock it first, then try again.' : message, 'error');
    }
}

function parseRotations(value) {
    const rotations = {};
    if (!value.trim()) return rotations;
    for (const item of value.split(',')) {
        const match = /^\s*(\d+)\s*:\s*(-?\d+)\s*$/.exec(item);
        if (!match) throw new Error('Use rotations such as 1:90, 3:270.');
        const page = Number(match[1]);
        const angle = Number(match[2]);
        if (page < 1 || page > pageCount || angle % 90 !== 0) throw new Error('Rotation pages must exist and angles must use 90-degree increments.');
        rotations[page - 1] = angle;
    }
    return rotations;
}

async function readPdf(file = files[0]) {
    return new Uint8Array(await file.arrayBuffer());
}

async function processFiles() {
    if (!files.length || busy) return;
    resetOutput();
    setBusy(true);
    setStatus('Processing locally in this browser…');
    try {
        if (mode === 'merge') {
            const documents = [];
            for (const file of files) documents.push(await readPdf(file));
            outputBytes = await runPdfWorker('merge', { documents }, documents.map((bytes) => bytes.buffer));
        } else if (mode === 'extract') {
            const bytes = await readPdf();
            const pageIndices = parsePageSelection(app.querySelector('#page-ranges').value, pageCount);
            outputBytes = await runPdfWorker('extract', { bytes, pageIndices }, [bytes.buffer]);
        } else if (mode === 'organize') {
            const bytes = await readPdf();
            const pageOrder = parsePageSelection(app.querySelector('#page-order').value, pageCount, { sort: false });
            const rotations = parseRotations(app.querySelector('#page-rotations').value);
            outputBytes = await runPdfWorker('organize', { bytes, pageOrder, rotations }, [bytes.buffer]);
        } else if (mode === 'images') {
            const images = [];
            for (const file of files) images.push({ bytes: new Uint8Array(await file.arrayBuffer()), type: imageType(file) });
            const options = {
                pageSize: app.querySelector('#image-page-size').value,
                margin: Number(app.querySelector('#image-margin').value),
            };
            outputBytes = await runPdfWorker('images', { images, options }, images.map((image) => image.bytes.buffer));
        } else if (mode === 'lock') {
            const password = app.querySelector('#pdf-password').value;
            if (password !== app.querySelector('#pdf-password-confirm').value) throw new Error('The passwords do not match.');
            const { lockPdf } = await import('./pdf-security.mjs');
            outputBytes = await lockPdf(await readPdf(), password);
        } else if (mode === 'unlock') {
            const { unlockPdf } = await import('./pdf-security.mjs');
            outputBytes = await unlockPdf(await readPdf(), app.querySelector('#pdf-password').value);
        } else if (mode === 'metadata') {
            const bytes = await readPdf();
            outputBytes = await runPdfWorker('metadata', { bytes }, [bytes.buffer]);
        } else if (mode === 'watermark') {
            const bytes = await readPdf();
            const options = {
                watermarkText: app.querySelector('#watermark-text').value,
                pageNumbers: app.querySelector('#page-numbers').checked,
                color: app.querySelector('#watermark-color').value,
                opacity: Number(app.querySelector('#watermark-opacity').value),
            };
            outputBytes = await runPdfWorker('watermark', { bytes, options }, [bytes.buffer]);
        }
        if (!(outputBytes instanceof Uint8Array) || outputBytes.byteLength === 0) throw new Error('The PDF engine did not produce an output file.');
        if (outputBytes.byteLength > MAX_OUTPUT_SIZE) {
            outputBytes = null;
            throw new Error('The generated PDF exceeds the 200 MB output limit.');
        }
        elements.outputSize.textContent = formatBytes(outputBytes.byteLength);
        elements.output.hidden = false;
        setStatus('Output ready. The source files were not uploaded.', 'success');
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setStatus(/encrypted/i.test(message) ? 'This PDF is encrypted. Unlock it first, then try again.' : message, 'error');
    } finally {
        clearPasswords();
        setBusy(false);
    }
}

elements.drop.addEventListener('click', () => { if (!busy) elements.input.click(); });
elements.drop.addEventListener('dragover', (event) => {
    event.preventDefault();
    if (!busy) elements.drop.classList.add('is-dragging');
});
elements.drop.addEventListener('dragleave', () => elements.drop.classList.remove('is-dragging'));
elements.drop.addEventListener('drop', (event) => {
    event.preventDefault();
    elements.drop.classList.remove('is-dragging');
    if (!busy) addFiles(event.dataTransfer.files);
});
elements.input.addEventListener('change', () => { if (!busy) addFiles(elements.input.files); });
app.querySelector('#pdf-options')?.addEventListener('input', resetOutput);
elements.run.addEventListener('click', processFiles);
elements.reset.addEventListener('click', reset);
elements.download.addEventListener('click', () => {
    if (!outputBytes) return;
    const sourceBase = files[0]?.name?.replace(/\.pdf$/i, '') || config.output.replace(/\.pdf$/i, '');
    const preferred = mode === 'merge' || mode === 'images' ? config.output : `${sourceBase}-${config.output}`;
    downloadBytes(outputBytes, safePdfFilename(preferred, config.output.replace(/\.pdf$/i, '')));
});

reset();
