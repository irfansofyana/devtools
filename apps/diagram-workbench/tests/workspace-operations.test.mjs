import assert from 'node:assert/strict';
import test from 'node:test';

import { createSerializedDeltaQueue, createWorkspaceOperationCoordinator, refreshCommittedLibraryView } from '../src/domain/workspace-operations.js';

test('serialized delta queues retry failed intent from the last successful editor baseline', async () => {
    const calls = [];
    let failFirst = true;
    const queue = createSerializedDeltaQueue({
        initialValue: ['original'],
        persist: async (previous, next) => {
            calls.push([previous, next]);
            if (failFirst) {
                failFirst = false;
                throw new Error('temporary failure');
            }
            return next;
        },
    });

    const first = queue.enqueue(['first-edit']);
    const second = queue.enqueue(['first-edit', 'second-edit']);
    await assert.rejects(first, /temporary failure/);
    assert.deepEqual(await second, ['first-edit', 'second-edit']);
    assert.deepEqual(calls, [
        [['original'], ['first-edit']],
        [['original'], ['first-edit', 'second-edit']],
    ]);
    assert.deepEqual(await queue.flush(), ['first-edit', 'second-edit']);
});

test('serialized delta queues expose failed pending writes and accept an authoritative baseline', async () => {
    const queue = createSerializedDeltaQueue({
        initialValue: ['original'],
        persist: async () => { throw new Error('disk unavailable'); },
    });
    const failed = queue.enqueue(['edit']);
    await assert.rejects(failed, /disk unavailable/);
    await assert.rejects(queue.flush(), /disk unavailable/);
    queue.setBaseline(['restored']);
    assert.deepEqual(queue.getBaseline(), ['restored']);
});

test('failed committed-library UI refresh restores the prior queue intent baseline', async () => {
    const queue = createSerializedDeltaQueue({
        initialValue: [{ id: 'editor-before' }],
        persist: async (_previous, desired) => desired,
    });
    const suppressionRef = { current: 0 };
    await assert.rejects(
        refreshCommittedLibraryView({
            queue,
            committedItems: [{ id: 'editor-before' }, { id: 'stored-import' }],
            suppressionRef,
            refresh: async () => {
                assert.equal(suppressionRef.current, 1);
                throw new Error('editor refresh failed');
            },
        }),
        /editor refresh failed/,
    );
    assert.deepEqual(queue.getBaseline(), [{ id: 'editor-before' }]);
    assert.equal(suppressionRef.current, 0);
});

test('workspace operations are exclusive and expose a monotonic transition token', async () => {
    const lifecycle = [];
    let releaseFirst;
    const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
    const coordinator = createWorkspaceOperationCoordinator({
        onStart: (label) => lifecycle.push(`start:${label}`),
        onFinish: (label) => lifecycle.push(`finish:${label}`),
    });

    const first = coordinator.run('open-board', async (token) => {
        assert.equal(token, 1);
        await firstGate;
        return 'opened';
    });
    assert.equal(coordinator.isActive(), true);
    assert.equal(coordinator.currentToken(), 1);

    const overlapping = await coordinator.run('create-board', async () => 'created');
    assert.deepEqual(overlapping, { accepted: false });

    releaseFirst();
    assert.deepEqual(await first, { accepted: true, token: 1, value: 'opened' });
    assert.equal(coordinator.isActive(), false);

    const next = await coordinator.run('export-workspace', async (token) => token);
    assert.deepEqual(next, { accepted: true, token: 2, value: 2 });
    assert.deepEqual(lifecycle, [
        'start:open-board',
        'finish:open-board',
        'start:export-workspace',
        'finish:export-workspace',
    ]);
});

test('workspace operation failures release the coordinator', async () => {
    const coordinator = createWorkspaceOperationCoordinator();
    await assert.rejects(
        coordinator.run('restore', async () => { throw new Error('replace failed'); }),
        /replace failed/,
    );
    assert.equal(coordinator.isActive(), false);
    assert.deepEqual(
        await coordinator.run('retry', async () => 'ok'),
        { accepted: true, token: 2, value: 'ok' },
    );
});
