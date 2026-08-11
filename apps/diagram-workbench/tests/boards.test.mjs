import assert from 'node:assert/strict';
import test from 'node:test';

import { createBoard, createCopyName, filterBoards, normalizeBoardName, sortBoardsByUpdatedAt } from '../src/domain/boards.js';

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

test('board discovery is case-insensitive and copy names remain unique and bounded', () => {
    const boards = [
        { id: '1', name: 'Product brainstorm', updatedAt: 300 },
        { id: '2', name: 'Checkout architecture', updatedAt: 200 },
        { id: '3', name: 'Product roadmap', updatedAt: 100 },
    ];
    assert.deepEqual(filterBoards(boards, ' PRODUCT ').map(({ id }) => id), ['1', '3']);
    assert.equal(filterBoards(boards, 'missing').length, 0);
    assert.equal(filterBoards(boards, '').length, 3);
    assert.equal(createCopyName('Product brainstorm', boards.map(({ name }) => name)), 'Product brainstorm copy');
    assert.equal(createCopyName('Product brainstorm', [...boards.map(({ name }) => name), 'Product brainstorm copy']), 'Product brainstorm copy 2');
    assert.ok(createCopyName('x'.repeat(80), []).length <= 80);
});
