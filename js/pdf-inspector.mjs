import { downloadBytes, formatBytes, isPdfFile, parsePageRanges } from './pdf-utils.mjs';

const LOW_MEMORY_DEVICE = Number(navigator.deviceMemory || 8) <= 4;
const MAX_FILE_SIZE = (LOW_MEMORY_DEVICE ? 35 : 50) * 1024 * 1024;
const elements = {
    input: document.querySelector('#pdf-input'),
    drop: document.querySelector('#pdf-drop'),
    file: document.querySelector('#pdf-file'),
    fileName: document.querySelector('#pdf-file-name'),
    fileSize: document.querySelector('#pdf-file-size'),
    password: document.querySelector('#pdf-password'),
    pages: document.querySelector('#pdf-pages'),
    profile: document.querySelector('#pdf-profile'),
    markers: document.querySelector('#pdf-page-markers'),
    process: document.querySelector('#pdf-process'),
    clear: document.querySelector('#pdf-clear'),
    status: document.querySelector('#pdf-status'),
    result: document.querySelector('#pdf-result'),
    output: document.querySelector('#pdf-markdown'),
    metrics: document.querySelector('#pdf-metrics'),
    ocrDetail: document.querySelector('#pdf-ocr-detail'),
    copy: document.querySelector('#pdf-copy'),
    download: document.querySelector('#pdf-download'),
};

let selectedFile = null;
let markdown = '';
let worker = null;
let busy = false;

function setStatus(message, tone = '') {
    elements.status.textContent = message;
    elements.status.dataset.tone = tone;
}

function setBusy(isBusy) {
    busy = isBusy;
    elements.process.disabled = isBusy || !selectedFile;
    elements.clear.disabled = isBusy;
    elements.input.disabled = isBusy;
    elements.drop.disabled = isBusy;
    elements.drop.setAttribute('aria-busy', String(isBusy));
}

function clearResult() {
    markdown = '';
    elements.output.textContent = '';
    elements.metrics.replaceChildren();
    elements.ocrDetail.textContent = '';
    elements.ocrDetail.hidden = true;
    elements.result.hidden = true;
    elements.copy.disabled = true;
    elements.download.disabled = true;
}

function reset() {
    worker?.terminate();
    worker = null;
    selectedFile = null;
    elements.input.value = '';
    elements.password.value = '';
    elements.file.hidden = true;
    clearResult();
    setBusy(false);
    setStatus('Choose a PDF to begin.');
}

async function selectFile(file) {
    if (busy) return;
    setBusy(true);
    selectedFile = null;
    elements.input.value = '';
    elements.password.value = '';
    elements.file.hidden = true;
    clearResult();
    try {
        if (!file || !(await isPdfFile(file))) throw new Error('Choose a valid PDF file.');
        if (file.size > MAX_FILE_SIZE) throw new Error(`Choose a PDF smaller than ${Math.round(MAX_FILE_SIZE / 1024 / 1024)} MB.`);
        selectedFile = file;
        elements.fileName.textContent = file.name;
        elements.fileSize.textContent = formatBytes(file.size);
        elements.file.hidden = false;
        setStatus('Ready to inspect locally.');
    } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error), 'error');
    } finally {
        setBusy(false);
    }
}


function addMetric(label, value, alert = false) {
    const item = document.createElement('div');
    item.className = `pdf-metric${alert ? ' pdf-metric--alert' : ''}`;
    const name = document.createElement('span');
    const detail = document.createElement('strong');
    name.textContent = label;
    detail.textContent = value;
    item.append(name, detail);
    elements.metrics.append(item);
}

function renderResult(result) {
    markdown = typeof result.markdown === 'string' ? result.markdown : '';
    const documentLabels = {
        TextBased: 'Text-based',
        ImageBased: 'Image-based',
        Scanned: 'Scanned',
        Mixed: 'Mixed',
    };
    addMetric('Document', documentLabels[result.pdfType] || result.pdfType || 'Unknown');
    addMetric('Pages', String(result.pageCount ?? '—'));
    addMetric('Confidence', Number.isFinite(result.confidence) ? `${Math.round(result.confidence * 100)}%` : '—');
    addMetric('Engine time', Number.isFinite(result.processingTimeMs) ? `${Math.max(1, Math.round(result.processingTimeMs))} ms` : '—');
    addMetric('OCR pages', result.pagesNeedingOcr?.length ? result.pagesNeedingOcr.join(', ') : 'None', Boolean(result.pagesNeedingOcr?.length));
    addMetric('Table pages', result.layout?.pagesWithTables?.length ? result.layout.pagesWithTables.join(', ') : 'None');
    addMetric('Column pages', result.layout?.pagesWithColumns?.length ? result.layout.pagesWithColumns.join(', ') : 'None');
    addMetric('Encoding', result.hasEncodingIssues ? 'Review needed' : 'Clean', Boolean(result.hasEncodingIssues));
    if (result.ocrReasonsByPage?.length) {
        const details = result.ocrReasonsByPage.slice(0, 10).map((entry) => {
            const reasons = entry.reasons.map((reason) => reason.replaceAll('_', ' ')).join(', ');
            return `page ${entry.page}: ${reasons}`;
        });
        const remaining = result.ocrReasonsByPage.length - details.length;
        elements.ocrDetail.textContent = `OCR review recommended — ${details.join('; ')}${remaining > 0 ? `; and ${remaining} more` : ''}.`;
        elements.ocrDetail.hidden = false;
    }
    elements.output.textContent = markdown || 'No Markdown was produced. This PDF may need OCR.';
    elements.result.hidden = false;
    elements.copy.disabled = !markdown;
    elements.download.disabled = !markdown;
}

async function inspect() {
    if (!selectedFile || busy) return;
    clearResult();
    setBusy(true);
    setStatus('Loading the local PDF engine…');
    try {
        const pages = parsePageRanges(elements.pages.value);
        const buffer = await selectedFile.arrayBuffer();
        const response = await new Promise((resolve, reject) => {
            worker = new Worker(new URL('./pdf-inspector.worker.mjs', import.meta.url), { type: 'module' });
            const timeout = window.setTimeout(() => reject(new Error('Inspection timed out. Try a smaller page range.')), 90000);
            worker.addEventListener('message', ({ data }) => {
                window.clearTimeout(timeout);
                if (data.ok) resolve(data.result);
                else reject(new Error(data.error || 'The PDF could not be inspected.'));
            }, { once: true });
            worker.addEventListener('error', (event) => {
                window.clearTimeout(timeout);
                reject(new Error(event.message || 'The PDF engine could not be loaded.'));
            }, { once: true });
            worker.postMessage({
                type: 'inspect',
                buffer,
                password: elements.password.value,
                pages,
                profile: elements.profile.value,
                includePageMarkers: elements.markers.checked,
            }, [buffer]);
        });
        renderResult(response);
        setStatus(`Finished inspecting ${selectedFile.name}.`, 'success');
    } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error), 'error');
    } finally {
        worker?.terminate();
        worker = null;
        elements.password.value = '';
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
elements.process.addEventListener('click', inspect);
elements.clear.addEventListener('click', reset);
elements.copy.addEventListener('click', async () => {
    await navigator.clipboard.writeText(markdown);
    setStatus('Markdown copied.', 'success');
});
elements.download.addEventListener('click', () => {
    const base = selectedFile.name.replace(/\.pdf$/i, '') || 'document';
    downloadBytes(new TextEncoder().encode(markdown), `${base}.md`, 'text/markdown;charset=utf-8');
});

reset();
