import assert from 'node:assert/strict';
import test from 'node:test';

import { createBoard, normalizeBoardName, sortBoardsByUpdatedAt } from '../src/domain/boards.js';

test('board names are trimmed, bounded, and receive a useful fallback', () => {
    assert.equal(normalizeBoardName('  Checkout architecture  '), 'Checkout architecture');
    assert.equal(normalizeBoardName('   '), 'Untitled diagram');
    assert.equal(normalizeBoardName('x'.repeat(120)).length, 80);
});

test('new boards have deterministic metadata and board lists sort by recent activity', () => {
    const board = createBoard({ id: 'board-1', name: ' API flow ', now: 100 });
    assert.deepEqual(board, {
        id: 'board-1',
        name: 'API flow',
        createdAt: 100,
        updatedAt: 100,
        thumbnail: null,
    });

    const sorted = sortBoardsByUpdatedAt([
        board,
        { ...board, id: 'board-2', updatedAt: 300 },
        { ...board, id: 'board-3', updatedAt: 200 },
    ]);
    assert.deepEqual(sorted.map(({ id }) => id), ['board-2', 'board-3', 'board-1']);
    assert.equal(sorted[2], board, 'sorting should not mutate board records');
});
