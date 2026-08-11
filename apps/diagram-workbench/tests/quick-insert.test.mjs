import assert from 'node:assert/strict';
import test from 'node:test';

import { createQuickInsertSkeletons, quickInsertCatalog } from '../src/domain/quick-insert.js';

test('quick insert catalog exposes useful whiteboard and flowchart blocks', () => {
    assert.deepEqual(
        quickInsertCatalog.map(({ id }) => id),
        ['sticky-note', 'headline', 'section', 'process', 'decision', 'start-end', 'callout'],
    );
    assert.ok(quickInsertCatalog.every(({ category, description, label }) => category && description && label));
});

test('quick insert blocks are finite, centered, and receive unique instance ids', () => {
    const supportedTypes = new Set(['rectangle', 'diamond', 'ellipse', 'text']);
    for (const item of quickInsertCatalog) {
        const skeletons = createQuickInsertSkeletons(item.id, { x: 800, y: 500 }, 'instance-a');
        assert.ok(skeletons.length >= 1, item.id);
        assert.ok(skeletons.every(({ id, type, x, y }) => id.startsWith('quick-instance-a-') && supportedTypes.has(type) && Number.isFinite(x) && Number.isFinite(y)), item.id);
        const left = Math.min(...skeletons.map(({ x }) => x));
        const top = Math.min(...skeletons.map(({ y }) => y));
        const right = Math.max(...skeletons.map(({ x, width = 0 }) => x + width));
        const bottom = Math.max(...skeletons.map(({ y, height = 0 }) => y + height));
        assert.ok(Math.abs((left + right) / 2 - 800) <= 1, item.id);
        assert.ok(Math.abs((top + bottom) / 2 - 500) <= 1, item.id);
    }
    assert.notDeepEqual(
        createQuickInsertSkeletons('sticky-note', { x: 0, y: 0 }, 'one').map(({ id }) => id),
        createQuickInsertSkeletons('sticky-note', { x: 0, y: 0 }, 'two').map(({ id }) => id),
    );
    assert.throws(() => createQuickInsertSkeletons('unknown', { x: 0, y: 0 }, 'bad'), /Unknown quick insert/);
});

test('sticky notes and sections use readable pastel defaults', () => {
    const [sticky] = createQuickInsertSkeletons('sticky-note', { x: 0, y: 0 }, 'sticky');
    assert.equal(sticky.backgroundColor, '#fff3bf');
    assert.equal(sticky.fillStyle, 'solid');
    assert.equal(sticky.label.text, 'Sticky note');

    const [section] = createQuickInsertSkeletons('section', { x: 0, y: 0 }, 'section');
    assert.ok(section.width >= 600);
    assert.ok(section.height >= 360);
    assert.equal(section.strokeStyle, 'dashed');
});
