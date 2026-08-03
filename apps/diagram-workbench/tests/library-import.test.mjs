import assert from 'node:assert/strict';
import test from 'node:test';

import { mergeImportedLibraryItems, stabilizeImportedLibraryItems } from '../src/domain/library-import.js';

function item(id, text, extra = {}) {
    return {
        id,
        status: 'published',
        created: 1,
        elements: [{ id: `element-${text}`, type: 'text', text, x: 0, y: 0 }],
        ...extra,
    };
}

test('community import appends unique items without replacing existing IDs', () => {
    const existing = [item('core', 'edited core'), item('custom', 'custom')];
    const imported = [item('core', 'upstream core'), item('new', 'new')];

    const merged = mergeImportedLibraryItems(existing, imported);

    assert.deepEqual(merged.map(({ id }) => id), ['core', 'custom', 'new']);
    assert.equal(merged[0].elements[0].text, 'edited core');
    assert.deepEqual(existing.map(({ id }) => id), ['core', 'custom']);
    assert.deepEqual(imported.map(({ id }) => id), ['core', 'new']);
});

test('legacy re-import skips identical element content even when generated item IDs differ', () => {
    const existing = [item('generated-first', 'legacy component')];
    const imported = [item('generated-second', 'legacy component')];

    const merged = mergeImportedLibraryItems(existing, imported);

    assert.equal(merged.length, 1);
    assert.equal(merged[0].id, 'generated-first');
});

test('an edited existing legacy item does not block importing the original as a new copy', () => {
    const existing = [item('generated-first', 'locally edited')];
    const imported = [item('generated-second', 'original')];

    const merged = mergeImportedLibraryItems(existing, imported);

    assert.deepEqual(merged.map(({ id }) => id), ['generated-first', 'generated-second']);
});

test('legacy library items receive deterministic IDs derived from the source file', async () => {
    const file = new Blob([JSON.stringify({ type: 'excalidrawlib', version: 1, library: [[{ type: 'text', text: 'legacy' }]] })]);
    const parsed = [item('random-first', 'legacy component')];

    const first = await stabilizeImportedLibraryItems(file, parsed);
    const second = await stabilizeImportedLibraryItems(file, [item('random-second', 'legacy component')]);

    assert.match(first[0].id, /^imported-[a-f0-9]{32}-0$/);
    assert.equal(first[0].id, second[0].id);
    assert.equal(parsed[0].id, 'random-first');
});

test('modern library item IDs remain untouched', async () => {
    const file = new Blob([JSON.stringify({ type: 'excalidrawlib', version: 2, libraryItems: [] })]);
    const parsed = [item('published-id', 'modern component')];

    const stabilized = await stabilizeImportedLibraryItems(file, parsed);

    assert.equal(stabilized[0].id, 'published-id');
});
