const PAGE_TOKEN = /^\d+(?:\s*-\s*\d+)?$/;

export function parsePageRanges(value, { maxPages = 2000 } = {}) {
    const input = String(value ?? '').trim();
    if (!input) return undefined;
    if (!Number.isInteger(maxPages) || maxPages < 1) throw new Error('Invalid page selection limit.');

    const selected = new Set();
    for (const rawToken of input.split(',')) {
        const token = rawToken.trim();
        if (!PAGE_TOKEN.test(token)) throw new Error(`Invalid page selection: "${rawToken}".`);
        const [startText, endText = startText] = token.split('-').map((part) => part.trim());
        const start = Number(startText);
        const end = Number(endText);
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start) {
            throw new Error(`Invalid page range: "${rawToken}".`);
        }
        if ((end - start) + 1 > maxPages) throw new Error(`Select at most ${maxPages} pages at a time.`);
        for (let page = start; page <= end; page += 1) {
            selected.add(page);
            if (selected.size > maxPages) throw new Error(`Select at most ${maxPages} pages at a time.`);
        }
    }
    return [...selected];
}

export function parsePageSelection(value, pageCount, options = {}) {
    if (!Number.isInteger(pageCount) || pageCount < 1) {
        throw new Error('The PDF has no readable pages.');
    }

    const input = String(value ?? '').trim();
    if (!input) return Array.from({ length: pageCount }, (_, index) => index);

    const selected = new Set();
    for (const rawToken of input.split(',')) {
        const token = rawToken.trim();
        if (!PAGE_TOKEN.test(token)) {
            throw new Error('Use page ranges such as 1-3, 5, 8-10.');
        }

        const [rawStart, rawEnd = rawStart] = token.split('-').map((part) => Number.parseInt(part.trim(), 10));
        if (rawStart < 1 || rawStart > pageCount || rawEnd < 1 || rawEnd > pageCount) {
            throw new Error(`Pages must be between 1 and ${pageCount}.`);
        }
        if (rawStart > rawEnd) {
            throw new Error('Each page range must start before it ends.');
        }
        for (let page = rawStart; page <= rawEnd; page += 1) selected.add(page - 1);
    }

    const result = [...selected];
    return options.sort === false ? result : result.sort((a, b) => a - b);
}

export function safePdfFilename(value, fallback = 'document') {
    const leaf = String(value ?? '').split(/[\\/]/).pop().trim();
    const withoutExtension = leaf.replace(/\.pdf$/i, '');
    const cleaned = withoutExtension
        .replace(/:/g, '-')
        .replace(/[?*"<>|\u0000-\u001f]/g, '')
        .replace(/\s+/g, ' ')
        .replace(/[. ]+$/g, '')
        .slice(0, 120)
        .trim();
    return `${cleaned || fallback}.pdf`;
}

export function normalizeHexColor(value) {
    const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(String(value ?? '').trim());
    if (!match) throw new Error('Use a six-digit hexadecimal color such as #2257d8.');
    return {
        r: Number.parseInt(match[1], 16) / 255,
        g: Number.parseInt(match[2], 16) / 255,
        b: Number.parseInt(match[3], 16) / 255,
    };
}

export function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return '—';
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB'];
    let value = bytes / 1024;
    let unit = units[0];
    for (let index = 1; value >= 1024 && index < units.length; index += 1) {
        value /= 1024;
        unit = units[index];
    }
    return `${value >= 10 ? value.toFixed(1) : value.toFixed(2)} ${unit}`;
}

export function downloadBytes(bytes, filename, type = 'application/pdf') {
    const url = URL.createObjectURL(new Blob([bytes], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function isPdfFile(file) {
    if (!file || file.size < 5) return false;
    const signature = new Uint8Array(await file.slice(0, 5).arrayBuffer());
    return new TextDecoder('ascii').decode(signature) === '%PDF-';
}
