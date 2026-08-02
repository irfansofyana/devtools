import assert from 'node:assert/strict';
import test from 'node:test';

import { getConnectionGeometry, layoutSelectedElements } from '../src/domain/layout.js';

const elements = [
    { id: 'service-b', type: 'rectangle', x: 500, y: 500, width: 180, height: 80 },
    { id: 'service-a', type: 'rectangle', x: 450, y: 100, width: 180, height: 80 },
    {
        id: 'edge', type: 'arrow', x: 490, y: 180, width: 100, height: 320,
        points: [[0, 0], [100, 320]], version: 1,
        startBinding: { elementId: 'service-a', gap: 10 },
        endBinding: { elementId: 'service-b', gap: 10 },
    },
    { id: 'edge-label', type: 'text', x: 500, y: 330, width: 60, height: 20, containerId: 'edge' },
    { id: 'untouched', type: 'rectangle', x: 900, y: 900, width: 100, height: 50 },
];

test('connection geometry preserves exact vertical and horizontal directions and gaps', () => {
    const start = { type: 'rectangle', x: 0, y: 0, width: 100, height: 50 };
    const verticalEnd = { type: 'rectangle', x: 0, y: 200, width: 100, height: 50 };
    assert.deepEqual(getConnectionGeometry(start, verticalEnd, 10, 20), {
        x: 50,
        y: 60,
        width: 0,
        height: 120,
        points: [[0, 0], [0, 120]],
    });

    const horizontalEnd = { type: 'rectangle', x: 300, y: 0, width: 100, height: 50 };
    assert.deepEqual(getConnectionGeometry(start, horizontalEnd, 10, 20), {
        x: 110,
        y: 25,
        width: 170,
        height: 0,
        points: [[0, 0], [170, 0]],
    });
});

test('selected auto-layout is deterministic, follows edge direction, and leaves unselected elements untouched', () => {
    const selected = { 'service-a': true, 'service-b': true, edge: true };
    const first = layoutSelectedElements(elements, selected);
    const second = layoutSelectedElements(elements, selected);

    assert.deepEqual(first, second);
    assert.deepEqual(first.find(({ id }) => id === 'untouched'), elements.at(-1));
    const arrangedStart = first.find(({ id }) => id === 'service-a');
    const arrangedEnd = first.find(({ id }) => id === 'service-b');
    const arrangedArrow = first.find(({ id }) => id === 'edge');
    assert.ok(arrangedStart.y < arrangedEnd.y);
    assert.notDeepEqual(arrangedArrow.points, elements.find(({ id }) => id === 'edge').points);
    const endpoint = arrangedArrow.points.at(-1);
    const globalEnd = { x: arrangedArrow.x + endpoint[0], y: arrangedArrow.y + endpoint[1] };
    const startCenter = { x: arrangedStart.x + arrangedStart.width / 2, y: arrangedStart.y + arrangedStart.height / 2 };
    const endCenter = { x: arrangedEnd.x + arrangedEnd.width / 2, y: arrangedEnd.y + arrangedEnd.height / 2 };
    assert.equal(arrangedArrow.startBinding.elementId, 'service-a');
    assert.equal(arrangedArrow.startBinding.gap, 10);
    assert.equal(arrangedArrow.endBinding.elementId, 'service-b');
    assert.equal(arrangedArrow.endBinding.gap, 10);
    assert.equal(arrangedArrow.version, 2);
    assert.equal(arrangedArrow.x, startCenter.x);
    assert.equal(globalEnd.x, endCenter.x);
    assert.equal(Math.abs(arrangedArrow.y - startCenter.y), arrangedStart.height / 2 + 10);
    assert.equal(Math.abs(globalEnd.y - endCenter.y), arrangedEnd.height / 2 + 10);
    const arrangedLabel = first.find(({ id }) => id === 'edge-label');
    assert.equal(arrangedLabel.x, arrangedArrow.x + endpoint[0] / 2 - arrangedLabel.width / 2);
    assert.equal(arrangedLabel.y, arrangedArrow.y + endpoint[1] / 2 - arrangedLabel.height / 2);
});

test('layout updates a connector when only one bound endpoint moves', () => {
    const arranged = layoutSelectedElements(elements, { 'service-a': true, untouched: true });
    const originalArrow = elements.find(({ id }) => id === 'edge');
    const arrangedArrow = arranged.find(({ id }) => id === 'edge');
    assert.notDeepEqual(
        { x: arrangedArrow.x, y: arrangedArrow.y, points: arrangedArrow.points },
        { x: originalArrow.x, y: originalArrow.y, points: originalArrow.points },
    );
    assert.deepEqual(arrangedArrow.startBinding, originalArrow.startBinding);
    assert.deepEqual(arrangedArrow.endBinding, originalArrow.endBinding);
    assert.equal(arrangedArrow.version, originalArrow.version + 1);
});

test('layout rejects fewer than two selected containers', () => {
    assert.throws(() => layoutSelectedElements(elements, { 'service-a': true }), /at least two/);
});
