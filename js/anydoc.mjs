import { downloadBytes, formatBytes } from './pdf-utils.mjs';

const LOW_MEMORY_DEVICE = Number(navigator.deviceMemory || 8) <= 4;
const MAX_FILE_SIZE = (LOW_MEMORY_DEVICE ? 35 : 50) * 1024 * 1024;
const SUPPORTED_EXTENSIONS = new Set([
    'doc', 'docx', 'docm', 'ppt', 'pps', 'pot', 'pptx', 'pptm', 'ppsx', 'ppsm',
    'xls', 'xlsx', 'xlsm', 'xlsb', 'odt', 'ods', 'odp', 'rtf', 'epub', 'csv', 'pdf',
]);
const FORMAT_LABELS = {
    doc: 'Word', docx: 'Word', ppt: 'PowerPoint', pptx: 'PowerPoint', xls: 'Excel',
    xlsx: 'Excel', odt: 'OpenDocument Text', ods: 'OpenDocument Spreadsheet',
    odp: 'OpenDocument Presentation', rtf: 'Rich Text', epub: 'EPUB', csv: 'CSV', pdf: 'PDF',
};

const elements = {
    input: document.querySelector('#anydoc-input'),
    drop: document.querySelector('#anydoc-drop'),
    file: document.querySelector('#anydoc-file'),
    fileName: document.querySelector('#anydoc-file-name'),
    fileSize: document.querySelector('#anydoc-file-size'),
    convert: document.querySelector('#anydoc-convert'),
    clear: document.querySelector('#anydoc-clear'),
    status: document.querySelector('#anydoc-status'),
    ocr: document.querySelector('#anydoc-ocr'),
    result: document.querySelector('#anydoc-result'),
    metrics: document.querySelector('#anydoc-metrics'),
    output: document.querySelector('#anydoc-markdown'),
    copy: document.querySelector('#anydoc-copy'),
    download: document.querySelector('#anydoc-download'),
};

let selectedFile = null;
let markdown = '';
let worker = null;
let busy = false;

function extensionOf(name) {
    return name.toLowerCase().split('.').pop() || '';
}

function setStatus(message, tone = '') {
    elements.status.textContent = message;
    elements.status.dataset.tone = tone;
}

function setBusy(isBusy) {
    busy = isBusy;
    elements.convert.disabled = isBusy || !selectedFile;
    elements.clear.disabled = isBusy;
    elements.input.disabled = isBusy;
    elements.drop.disabled = isBusy;
    elements.drop.setAttribute('aria-busy', String(isBusy));
}

function clearResult() {
    markdown = '';
    elements.output.textContent = '';
    elements.metrics.replaceChildren();
    elements.ocr.replaceChildren();
    elements.ocr.hidden = true;
    elements.result.hidden = true;
    elements.copy.disabled = true;
    elements.download.disabled = true;
}

function reset() {
    worker?.terminate();
    worker = null;
    selectedFile = null;
    elements.input.value = '';
    elements.file.hidden = true;
    clearResult();
    setBusy(false);
    setStatus('Choose a document to begin.');
}

function addMetric(label, value) {
    const item = document.createElement('div');
    item.className = 'pdf-metric';
    const name = document.createElement('span');
    const detail = document.createElement('strong');
    name.textContent = label;
    detail.textContent = value;
    item.append(name, detail);
    elements.metrics.append(item);
}

function validateFile(file) {
    if (!file) throw new Error('Choose a document to convert.');
    const extension = extensionOf(file.name);
    if (!SUPPORTED_EXTENSIONS.has(extension)) throw new Error('This file type is not supported by AnyDoc.');
    if (file.size === 0) throw new Error('This file is empty.');
    if (file.size > MAX_FILE_SIZE) throw new Error(`Choose a document smaller than ${Math.round(MAX_FILE_SIZE / 1024 / 1024)} MB.`);
}

function selectFile(file) {
    if (busy) return;
    clearResult();
    selectedFile = null;
    elements.input.value = '';
    elements.file.hidden = true;
    try {
        validateFile(file);
        selectedFile = file;
        elements.fileName.textContent = file.name;
        elements.fileSize.textContent = formatBytes(file.size);
        elements.file.hidden = false;
        setStatus('Ready to convert locally.');
    } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error), 'error');
    }
    setBusy(false);
}

function renderResult(result) {
    markdown = result.markdown;
    addMetric('Format', FORMAT_LABELS[result.format] || String(result.format).toUpperCase());
    addMetric('Characters', markdown.length.toLocaleString());
    addMetric('Engine time', `${Math.max(1, Math.round(result.processingTimeMs))} ms`);
    elements.output.textContent = markdown;
    elements.result.hidden = false;
    elements.copy.disabled = false;
    elements.download.disabled = false;
}

function showOcrRequired(error) {
    const pages = Array.isArray(error.pages) && error.pages.length ? error.pages.join(', ') : 'one or more pages';
    const message = document.createElement('p');
    message.textContent = `OCR is required for ${pages}. AnyDoc detected the scanned pages, but this local browser wrapper does not upload files or run OCR.`;
    const links = document.createElement('p');
    const inspectLink = document.createElement('a');
    inspectLink.href = './pdf-inspector.html';
    inspectLink.textContent = 'Inspect the PDF';
    const separator = document.createTextNode(' · ');
    const ocrLink = document.createElement('a');
    ocrLink.href = './ocr-tool.html';
    ocrLink.textContent = 'Open the local OCR tool';
    links.append(inspectLink, separator, ocrLink);
    elements.ocr.append(message, links);
    elements.ocr.hidden = false;
    setStatus('This PDF needs OCR before AnyDoc can convert it.', 'error');
}

async function convert() {
    if (!selectedFile || busy) return;
    clearResult();
    setBusy(true);
    setStatus('Loading the local AnyDoc engine…');
    try {
        const buffer = await selectedFile.arrayBuffer();
        const response = await new Promise((resolve, reject) => {
            worker = new Worker(new URL('./anydoc.worker.mjs', import.meta.url), { type: 'module' });
            const timeout = window.setTimeout(() => reject({ code: 'timeout', message: 'Conversion timed out. Try a smaller document.' }), 90000);
            worker.addEventListener('message', ({ data }) => {
                window.clearTimeout(timeout);
                if (data.ok) resolve(data.result);
                else reject(data.error || { code: 'unknown', message: 'The document could not be converted.' });
            }, { once: true });
            worker.addEventListener('error', (event) => {
                window.clearTimeout(timeout);
                reject({ code: 'engine', message: event.message || 'The AnyDoc engine could not be loaded.' });
            }, { once: true });
            worker.postMessage({ type: 'convert', buffer, name: selectedFile.name }, [buffer]);
        });
        renderResult(response);
        setStatus(`Finished converting ${selectedFile.name}.`, 'success');
    } catch (error) {
        if (error?.code === 'needsOcr') showOcrRequired(error);
        else if (error?.code === 'encrypted') setStatus('Encrypted documents are not supported. Remove the password and try again.', 'error');
        else if (error?.code === 'resourceLimit') setStatus('This document exceeded the local safety limit. Try a smaller file.', 'error');
        else setStatus(error?.message || 'The document could not be converted.', 'error');
    } finally {
        worker?.terminate();
        worker = null;
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
    if (!busy) selectFile(event.dataTransfer.files[0]);
});
elements.input.addEventListener('change', () => { if (!busy) selectFile(elements.input.files[0]); });
elements.convert.addEventListener('click', convert);
elements.clear.addEventListener('click', reset);
elements.copy.addEventListener('click', async () => {
    await navigator.clipboard.writeText(markdown);
    setStatus('Markdown copied.', 'success');
});
elements.download.addEventListener('click', () => {
    const base = selectedFile.name.replace(/\.[^.]+$/, '') || 'document';
    downloadBytes(new TextEncoder().encode(markdown), `${base}.md`, 'text/markdown;charset=utf-8');
});

reset();
