/**
 * Devtools — shared utilities.
 *
 * Exposes:
 *   showError(message, elementId)    — display dismissable error
 *   showSuccess(message, elementId)  — display dismissable success
 *   downloadTextFile(content, name)  — trigger a file download
 *   copyToClipboard(text, btn)       — programmatic copy with button feedback
 *
 * Tool pages can opt-in by:
 *   - giving a button `data-copy="<targetId>"`; the click handler reads the
 *     value of an <input>/<textarea>, OR the textContent of any other element
 *     (e.g. <pre>, <code>) and copies it.
 *
 * The previous implementation only supported `.value`, which silently copied
 * empty strings when the target was a <code> element (e.g. JSON formatter).
 */
document.addEventListener('DOMContentLoaded', () => {
    const currentYearElement = document.getElementById('current-year');
    if (currentYearElement) {
        currentYearElement.textContent = new Date().getFullYear();
    }

    populateToolPageTitle();
    initCopyToClipboard();
});

/**
 * On tool pages, slugify the page <h1> into the top-bar breadcrumb slot.
 * (e.g. "JSON Beautifier/Minifier" -> "json-beautifier-minifier")
 */
function populateToolPageTitle() {
    const slot = document.getElementById('tool-crumb');
    if (!slot || slot.textContent.trim()) return;
    const h1 = document.querySelector('.tool-header h1, main h1');
    if (!h1) return;
    slot.textContent = h1.textContent
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

/**
 * Initialise the global delegated click handler for `[data-copy]` buttons.
 */
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

/**
 * Read text from any element type (input, textarea, code/pre, generic block).
 * @param {HTMLElement} el
 * @returns {string}
 */
function readCopyableText(el) {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        return el.value || '';
    }
    // <pre>, <code>, <div>, etc.
    return el.innerText || el.textContent || '';
}

/**
 * Copy a string to clipboard and show a brief "Copied!" state on the button.
 * @param {string} text
 * @param {HTMLElement} [btn]
 * @returns {Promise<boolean>}
 */
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

/**
 * Show an error message inside an alert element (auto-hides after 5s).
 * Wraps the message in an alert--error look automatically.
 */
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

/**
 * Show a success message inside an alert element (auto-hides after 5s).
 */
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

/**
 * Trigger a download of a text blob.
 */
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
