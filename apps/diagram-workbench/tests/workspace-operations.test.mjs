import assert from 'node:assert/strict';
import test from 'node:test';

import { createWorkspaceOperationCoordinator } from '../src/domain/workspace-operations.js';

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
