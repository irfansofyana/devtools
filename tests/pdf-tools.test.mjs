import assert from 'node:assert/strict';
import test from 'node:test';

import { PDFDocument } from '../vendor/pdf-lib/1.17.1/pdf-lib.mjs';
import {
    cleanPdfMetadata,
    createPdfFromImages,
    extractPdfPages,
    mergePdfDocuments,
    organizePdfPages,
    stampPdf,
} from '../js/pdf-engine.mjs';
import { validatePdfPassword } from '../js/pdf-security.mjs';
import {
    normalizeHexColor,
    parsePageRanges,
    parsePageSelection,
    safePdfFilename,
} from '../js/pdf-utils.mjs';

async function makePdf(pageCount, title = 'Private title') {
    const document = await PDFDocument.create();
    document.setTitle(title);
    for (let index = 0; index < pageCount; index += 1) {
        document.addPage([300 + index, 400 + index]);
    }
    return document.save();
}

test('parsePageSelection expands one-indexed ranges into unique zero-indexed pages', () => {
    assert.deepEqual(parsePageSelection('1-3, 5, 3, 8-9', 10), [0, 1, 2, 4, 7, 8]);
    assert.deepEqual(parsePageSelection('', 3), [0, 1, 2]);
});

test('parsePageRanges bounds explicit Inspector selections before expansion', () => {
    assert.deepEqual(parsePageRanges('3, 1-2, 3'), [3, 1, 2]);
    assert.equal(parsePageRanges(''), undefined);
    assert.throws(() => parsePageRanges('1-1000000000'), /at most 2000 pages/i);
    assert.throws(() => parsePageRanges('9007199254740992'), /invalid page range/i);
});

test('parsePageSelection can preserve explicit order for the organizer', () => {
    assert.deepEqual(parsePageSelection('3, 1-2, 3, 5', 5, { sort: false }), [2, 0, 1, 4]);
});

test('parsePageSelection rejects invalid and out-of-range pages', () => {
    assert.throws(() => parsePageSelection('0,2', 3), /between 1 and 3/);
    assert.throws(() => parsePageSelection('4', 3), /between 1 and 3/);
    assert.throws(() => parsePageSelection('3-1', 3), /start before it ends/);
    assert.throws(() => parsePageSelection('one', 3), /page ranges/);
});

test('safePdfFilename strips unsafe path characters and preserves a PDF extension', () => {
    assert.equal(safePdfFilename('../Quarterly: report?.pdf', 'document'), 'Quarterly- report.pdf');
    assert.equal(safePdfFilename('   ', 'merged'), 'merged.pdf');
    assert.equal(safePdfFilename('scan', 'document'), 'scan.pdf');
});

test('normalizeHexColor accepts six-digit colors only', () => {
    assert.deepEqual(normalizeHexColor('#2257d8'), { r: 34 / 255, g: 87 / 255, b: 216 / 255 });
    assert.throws(() => normalizeHexColor('red'), /six-digit/i);
});

test('PDF password validation enforces QPDF encoded-byte boundaries', () => {
    assert.equal(validatePdfPassword('-safe-password'), '-safe-password');
    assert.equal(validatePdfPassword('@safe-password'), '@safe-password');
    assert.equal(validatePdfPassword('😀😀😀😀😀😀😀😀'), '😀😀😀😀😀😀😀😀');
    assert.throws(() => validatePdfPassword('😀'.repeat(32)), /127 UTF-8 bytes/i);
    assert.throws(() => validatePdfPassword('abcdefgh\0ignored'), /control characters/i);
    assert.throws(() => validatePdfPassword('short'), /at least 8 UTF-8 bytes/i);
    assert.equal(validatePdfPassword('', { requireMinimum: false }), '');
});

test('mergePdfDocuments preserves every source page in file order', async () => {
    const merged = await mergePdfDocuments([await makePdf(2), await makePdf(3)]);
    const result = await PDFDocument.load(merged);
    assert.equal(result.getPageCount(), 5);
});

test('extractPdfPages copies only requested pages in requested order', async () => {
    const source = await makePdf(4);
    const extracted = await extractPdfPages(source, [3, 0]);
    const result = await PDFDocument.load(extracted);
    assert.equal(result.getPageCount(), 2);
    assert.deepEqual(result.getPages().map((page) => page.getWidth()), [303, 300]);
});

test('organizePdfPages reorders, removes, and rotates pages', async () => {
    const source = await makePdf(3);
    const organized = await organizePdfPages(source, [2, 0], { 2: 90 });
    const result = await PDFDocument.load(organized);
    assert.equal(result.getPageCount(), 2);
    assert.deepEqual(result.getPages().map((page) => page.getWidth()), [302, 300]);
    assert.equal(result.getPage(0).getRotation().angle, 90);
});

test('cleanPdfMetadata removes the document information dictionary and XMP metadata', async () => {
    const cleaned = await cleanPdfMetadata(await makePdf(1, 'Confidential'));
    const result = await PDFDocument.load(cleaned, { updateMetadata: false });
    assert.equal(result.getTitle(), undefined);
    assert.equal(result.getAuthor(), undefined);
});

test('stampPdf adds a watermark and page numbers without changing page count', async () => {
    const source = await makePdf(2);
    const stamped = await stampPdf(source, {
        watermarkText: 'DRAFT',
        pageNumbers: true,
        color: '#2257d8',
        opacity: 0.25,
    });
    const result = await PDFDocument.load(stamped);
    assert.equal(result.getPageCount(), 2);
    assert.ok(stamped.byteLength > source.byteLength);
});

test('stampPdf rejects unsupported text and invalid numeric options clearly', async () => {
    const source = await makePdf(1);
    await assert.rejects(() => stampPdf(source, { watermarkText: '机密' }), /Latin characters only/i);
    await assert.rejects(() => stampPdf(source, { watermarkText: 'DRAFT', opacity: Number.NaN }), /opacity/i);
});

test('createPdfFromImages converts supported image bytes into one page per image', async () => {
    const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'));
    const created = await createPdfFromImages([
        { bytes: png, type: 'image/png' },
        { bytes: png, type: 'image/png' },
    ]);
    const result = await PDFDocument.load(created);
    assert.equal(result.getPageCount(), 2);
});

test('createPdfFromImages rejects malformed data and unsafe margins', async () => {
    const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'));
    await assert.rejects(() => createPdfFromImages([{ bytes: png, type: 'image/png' }], { pageSize: 'a4', margin: -1 }), /margin/i);
    await assert.rejects(() => createPdfFromImages([{ bytes: new Uint8Array([1, 2, 3]), type: 'image/png' }]), /malformed/i);
});

test('phase one through three expose focused PDF tools in the catalog', async () => {
    const { readFile } = await import('node:fs/promises');
    const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
    const expected = [
        'pdf-inspector.html',
        'anydoc.html',
        'pdf-merge.html',
        'pdf-extract-pages.html',
        'pdf-organize.html',
        'images-to-pdf.html',
        'pdf-lock.html',
        'pdf-unlock.html',
        'pdf-metadata.html',
        'pdf-watermark.html',
    ];
    for (const page of expected) {
        assert.match(index, new RegExp(`tools/${page.replace('.', '\\.')}`));
        const html = await readFile(new URL(`../tools/${page}`, import.meta.url), 'utf8');
        assert.match(html, /body class="tool-page-shell"/);
        assert.match(html, /Files stay in this browser/);
        assert.doesNotMatch(html, /cdn\.jsdelivr|unpkg\.com/);
    }
});

test('PDF Inspector uses a vendored WASM engine in a disposable worker', async () => {
    const { access, readFile } = await import('node:fs/promises');
    const worker = await readFile(new URL('../js/pdf-inspector.worker.mjs', import.meta.url), 'utf8');
    const controller = await readFile(new URL('../js/pdf-inspector.mjs', import.meta.url), 'utf8');
    await access(new URL('../vendor/pdf-inspector/0.1.3/pdf_inspector_wasm_bg.wasm', import.meta.url));
    assert.match(worker, /processPdf/);
    assert.match(worker, /pdf_inspector_wasm\.mjs/);
    assert.match(controller, /new Worker/);
    assert.match(controller, /terminate\(\)/);
});

test('AnyDoc uses its pinned local WASM engine in a disposable worker', async () => {
    const { access, readFile } = await import('node:fs/promises');
    const page = await readFile(new URL('../tools/anydoc.html', import.meta.url), 'utf8');
    const worker = await readFile(new URL('../js/anydoc.worker.mjs', import.meta.url), 'utf8');
    const controller = await readFile(new URL('../js/anydoc.mjs', import.meta.url), 'utf8');
    await access(new URL('../vendor/anydoc/0.2.4/anydoc_wasm_bg.wasm', import.meta.url));
    assert.match(page, /Files stay in this browser/);
    assert.match(page, /Word, PowerPoint, Excel, OpenDocument, RTF, EPUB, CSV, and PDF/i);
    assert.match(worker, /toMarkdownBytes/);
    assert.match(worker, /anydoc_wasm\.mjs/);
    assert.doesNotMatch(worker, /fetch\(|firecrawl\.dev\/parse|api\.firecrawl/);
    assert.match(controller, /new Worker/);
    assert.match(controller, /terminate\(\)/);
    assert.match(controller, /needsOcr/);
});

test('PDF password tools use a local QPDF worker and never persist passwords', async () => {
    const { access, readFile } = await import('node:fs/promises');
    const security = await readFile(new URL('../js/pdf-security.mjs', import.meta.url), 'utf8');
    await access(new URL('../vendor/qpdf-run/0.2.1/vendor/qpdf/lib/qpdf.wasm', import.meta.url));
    assert.match(security, /createQpdfRunner/);
    assert.match(security, /--encrypt/);
    assert.match(security, /--decrypt/);
    assert.doesNotMatch(security, /localStorage|sessionStorage|console\.log/);
});

test('PDF manipulation is lazy-loaded in a disposable worker', async () => {
    const { readFile } = await import('node:fs/promises');
    const app = await readFile(new URL('../js/pdf-tool-app.mjs', import.meta.url), 'utf8');
    const worker = await readFile(new URL('../js/pdf-tool.worker.mjs', import.meta.url), 'utf8');
    assert.match(app, /new Worker/);
    assert.match(app, /worker\.terminate\(\)/);
    assert.doesNotMatch(app, /from '\.\/pdf-engine\.mjs'/);
    assert.match(app, /await import\('\.\/pdf-security\.mjs'\)/);
    assert.match(worker, /from '\.\/pdf-engine\.mjs'/);
});

test('vendored PDF engine assets match the reviewed integrity hashes', async () => {
    const { createHash } = await import('node:crypto');
    const { readFile } = await import('node:fs/promises');
    const expected = new Map([
        ['../vendor/pdf-lib/1.17.1/pdf-lib.mjs', '72c052d97b4d5d9fa6cdbdcb7ad709f03d4ddb1122390cb3afeba4d88651d969'],
        ['../vendor/pdf-inspector/0.1.3/pdf_inspector_wasm_bg.wasm', '8208c6c288b7a4e6656400bf6963b1278a279d6dee6a25f21d79ea3604c16db8'],
        ['../vendor/anydoc/0.2.4/anydoc_wasm.mjs', '4860ad4c02c523593a5dae7698e186e8d7cf75a0e0bf3c2c294373de58eaee74'],
        ['../vendor/anydoc/0.2.4/anydoc_wasm_bg.wasm', '9f37cd53b17bf4028ac5ae6a2ac4cf625e9c53be511797168780bab495de1a9e'],
        ['../vendor/qpdf-run/0.2.1/vendor/qpdf/lib/qpdf.wasm', '86cba3db67ce3add2dd4b3533dd0614dade0b4e98b14a229bfda90306c053dd3'],
    ]);
    for (const [path, digest] of expected) {
        const bytes = await readFile(new URL(path, import.meta.url));
        assert.equal(createHash('sha256').update(bytes).digest('hex'), digest);
    }
});
