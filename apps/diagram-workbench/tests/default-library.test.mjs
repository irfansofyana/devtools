import assert from 'node:assert/strict';
import test from 'node:test';

import {
    DEFAULT_LIBRARY_VERSION,
    createDefaultLibraryMigration,
    defaultLibraryDefinitions,
    applyLibraryItemsDelta,
} from '../src/domain/default-library.js';

test('Irfan Core contains a focused first-party AWS, Kubernetes, AI/LLM, and pattern catalog', () => {
    assert.equal(DEFAULT_LIBRARY_VERSION, 1);
    assert.equal(defaultLibraryDefinitions.length, 36);
    assert.deepEqual(
        Object.fromEntries(['AWS Core', 'Kubernetes', 'AI / LLM', 'Patterns'].map((category) => [
            category,
            defaultLibraryDefinitions.filter((definition) => definition.category === category).length,
        ])),
        { 'AWS Core': 14, Kubernetes: 9, 'AI / LLM': 9, Patterns: 4 },
    );

    const names = new Set(defaultLibraryDefinitions.map(({ name }) => name));
    for (const required of ['EC2', 'EKS', 'IAM', 'VPC', 'Pod', 'Deployment', 'LLM Gateway', 'RAG Pipeline', 'Private EKS Platform']) {
        assert.ok(names.has(required), `missing ${required}`);
    }

    assert.equal(new Set(defaultLibraryDefinitions.map(({ id }) => id)).size, defaultLibraryDefinitions.length);
    for (const definition of defaultLibraryDefinitions) {
        assert.match(definition.id, /^irfan-core-[a-z0-9-]+-v1$/);
        assert.equal(definition.introducedIn, 1);
        assert.equal(definition.provenance, 'First-party original editable artwork');
        assert.equal(definition.license, 'MIT');
        assert.ok(definition.skeletons.length > 0);
        assert.ok(definition.skeletons.every(({ type }) => ['rectangle', 'ellipse', 'diamond', 'arrow', 'text'].includes(type)));
        assert.ok(definition.skeletons.some(({ label, text }) => label?.text?.includes(definition.name) || text?.includes(definition.name)), `${definition.name} needs a visible label`);
        const minX = Math.min(...definition.skeletons.map(({ x }) => x));
        const minY = Math.min(...definition.skeletons.map(({ y }) => y));
        const maxX = Math.max(...definition.skeletons.map(({ x, width = 0 }) => x + width));
        const maxY = Math.max(...definition.skeletons.map(({ y, height = 0 }) => y + height));
        assert.ok((maxX - minX) / (maxY - minY) <= 1.5, `${definition.name} thumbnail is too wide to read`);
    }
});

test('default-library migration seeds once without replacing existing or user library items', () => {
    const existing = [
        { id: 'user-item', elements: [{ id: 'user-shape' }] },
        { id: defaultLibraryDefinitions[0].id, elements: [{ id: 'customized-built-in' }] },
    ];
    const materialize = (definition) => ({ id: definition.id, elements: [{ id: `shape-${definition.id}` }] });
    const migration = createDefaultLibraryMigration(existing, 0, materialize);

    assert.equal(migration.version, DEFAULT_LIBRARY_VERSION);
    assert.equal(migration.added, defaultLibraryDefinitions.length - 1);
    assert.equal(migration.libraryItems.find(({ id }) => id === 'user-item').elements[0].id, 'user-shape');
    assert.equal(migration.libraryItems.find(({ id }) => id === defaultLibraryDefinitions[0].id).elements[0].id, 'customized-built-in');
    assert.equal(new Set(migration.libraryItems.map(({ id }) => id)).size, migration.libraryItems.length);
});

test('library deltas preserve concurrent additions and deletions while applying local edits', () => {
    const item = (id, value) => ({ id, value });
    const previous = [
        item('unchanged', 'old'),
        item('locally-removed', 'old'),
        item('locally-edited', 'old'),
        item('deleted-in-other-tab', 'old'),
    ];
    const next = [
        item('unchanged', 'old'),
        item('locally-edited', 'new'),
        item('deleted-in-other-tab', 'old'),
        item('locally-added', 'new'),
    ];
    const current = [
        item('unchanged', 'changed-in-other-tab'),
        item('locally-removed', 'old'),
        item('locally-edited', 'old'),
        item('added-in-other-tab', 'new'),
    ];

    assert.deepEqual(applyLibraryItemsDelta(current, previous, next), [
        item('unchanged', 'changed-in-other-tab'),
        item('locally-edited', 'new'),
        item('added-in-other-tab', 'new'),
        item('locally-added', 'new'),
    ]);
});

test('seeded versions preserve user deletions and only introduce definitions from newer versions', () => {
    let materializeCalls = 0;
    const migration = createDefaultLibraryMigration([], DEFAULT_LIBRARY_VERSION, () => {
        materializeCalls += 1;
        return null;
    });

    assert.equal(migration, null);
    assert.equal(materializeCalls, 0);
});
