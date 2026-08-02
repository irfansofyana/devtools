/**
 * tools. — shared utilities.
 */
document.addEventListener('DOMContentLoaded', () => {
    loadWorkbenchStyles();
    const yearEl = document.getElementById('current-year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();
    initCopyToClipboard();
    enhanceToolShell();
});

function loadWorkbenchStyles() {
    if (document.querySelector('link[data-workbench-styles]')) return;
    const script = document.querySelector('script[src$="js/main.js"], script[src$="../js/main.js"]');
    const href = script?.src
        ? new URL('../css/workbench.css', script.src).href
        : `${location.pathname.includes('/tools/') ? '../' : ''}css/workbench.css`;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.workbenchStyles = 'true';
    document.head.appendChild(link);
}

function enhanceToolShell() {
    if (!document.body.classList.contains('tool-page-shell')) return;
    document.body.dataset.workbench = 'tool';

    document.querySelectorAll('.tool-content > .input-group, .tool-content > .options-group, .tool-content > .input-section').forEach((el) => {
        el.classList.add('workbench-panel');
    });

    document.querySelectorAll('.tool-content > .result-container, .tool-content > [id$="result-container"], .tool-content > [id$="-result"]').forEach((el) => {
        el.classList.add('workbench-panel', 'workbench-panel--result');
    });
}

function initCopyToClipboard() {
    document.addEventListener('click', (e) => {
        const trigger = e.target.closest('[data-copy]');
        if (!trigger) return;
        const target = document.getElementById(trigger.dataset.copy);
        if (!target) return;
        const text = readCopyableText(target);
        if (!text) return;
        copyToClipboard(text, trigger);
    });
}

function readCopyableText(el) {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        return el.value || '';
    }
    return el.innerText || el.textContent || '';
}

function copyToClipboard(text, btn) {
    const finish = (ok) => {
        if (!btn) return;
        const original = btn.textContent;
        btn.textContent = ok ? 'Copied!' : 'Copy failed';
        btn.classList.add('copied');
        setTimeout(() => {
            btn.textContent = original;
            btn.classList.remove('copied');
        }, 1800);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text)
            .then(() => { finish(true); return true; })
            .catch(() => { fallbackCopy(text); finish(true); return true; });
    }
    fallbackCopy(text);
    finish(true);
    return Promise.resolve(true);
}

function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'absolute';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (_) { /* ignore */ }
    document.body.removeChild(ta);
}

function showError(message, elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.textContent = message;
    el.classList.remove('hidden');
    el.classList.add('alert', 'alert--error');
    if (!el.hasAttribute('role')) el.setAttribute('role', 'alert');
    if (!el.hasAttribute('aria-live')) el.setAttribute('aria-live', 'polite');
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(() => el.classList.add('hidden'), 5000);
}

function showSuccess(message, elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.textContent = message;
    el.classList.remove('hidden');
    el.classList.add('alert', 'alert--success');
    if (!el.hasAttribute('role')) el.setAttribute('role', 'status');
    if (!el.hasAttribute('aria-live')) el.setAttribute('aria-live', 'polite');
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(() => el.classList.add('hidden'), 5000);
}

function downloadTextFile(content, filename, mimeType = 'text/plain') {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
