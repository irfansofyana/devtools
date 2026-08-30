import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { PDFDocument } from '../vendor/pdf-lib/1.17.1/pdf-lib.mjs';
import { initSync, toMarkdownBytes } from '../vendor/anydoc/0.2.4/anydoc_wasm.mjs';

const wasm = await readFile(new URL('../vendor/anydoc/0.2.4/anydoc_wasm_bg.wasm', import.meta.url));
initSync({ module: wasm });

test('AnyDoc converts CSV bytes to Markdown with an explicit format', () => {
    const markdown = toMarkdownBytes(new TextEncoder().encode('name,score\nAda,10\nLinus,9\n'), 'csv');
    assert.match(markdown, /\| name \| score \|/i);
    assert.match(markdown, /\| Ada \| 10 \|/);
    assert.match(markdown, /\| Linus \| 9 \|/);
});

test('AnyDoc reports image-only PDF pages that require OCR', async () => {
    const document = await PDFDocument.create();
    const image = await document.embedPng(Uint8Array.from(Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64',
    )));
    const page = document.addPage([100, 100]);
    page.drawImage(image, { x: 0, y: 0, width: 100, height: 100 });
    const bytes = await document.save();

    assert.throws(
        () => toMarkdownBytes(bytes, 'pdf'),
        (error) => error?.code === 'needsOcr'
            && Array.isArray(error.pages)
            && error.pages.includes(1),
    );
});

test('AnyDoc rejects unsupported bytes rather than fabricating output', () => {
    assert.throws(
        () => toMarkdownBytes(new Uint8Array([0, 1, 2, 3])),
        (error) => error?.code === 'unsupported',
    );
});
