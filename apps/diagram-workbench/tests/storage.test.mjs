import assert from 'node:assert/strict';
import test from 'node:test';
import 'fake-indexeddb/auto';

import { createDefaultLibraryMigration } from '../src/domain/default-library.js';
import { createSerializedDeltaQueue } from '../src/domain/workspace-operations.js';

const storage = await import('../src/storage/workspace-db.js');

function board(id, updatedAt = 1) {
    return { id, name: `Board ${id}`, tags: [], createdAt: updatedAt, updatedAt, schemaVersion: 1 };
}

function scene(id) {
    return {
        type: 'excalidraw',
        version: 2,
        source: 'storage-test',
        elements: [{ id: `shape-${id}`, type: 'rectangle' }],
        appState: { viewBackgroundColor: '#fff' },
        files: {
            [`file-${id}`]: {
                id: `file-${id}`,
                mimeType: 'image/png',
                dataURL: 'data:image/png;base64,iVBORw0KGgo=',
                created: 1,
            },
        },
    };
}

test('versioned IndexedDB schema round-trips boards, scenes, embedded files, and settings', async () => {
    await storage.clearWorkspace();
    await storage.saveBoard(board('one'), JSON.stringify(scene('one')));
    await storage.setSettings({
        'current-board-id': 'one',
        'default-library-version': 1,
        'library-items': [{ id: 'core-item' }],
    });

    assert.deepEqual((await storage.listBoards()).map(({ id }) => id), ['one']);
    assert.equal((await storage.loadScene('one')).files['file-one'].mimeType, 'image/png');
    assert.equal(await storage.getSetting('current-board-id'), 'one');
    assert.equal(await storage.getSetting('default-library-version'), 1);
    assert.deepEqual(await storage.getSetting('library-items'), [{ id: 'core-item' }]);

    const request = indexedDB.open('tools-diagram-workbench');
    const db = await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
    assert.equal(db.version, 1);
    assert.deepEqual([...db.objectStoreNames], ['boards', 'scenes', 'settings']);
    db.close();
});

test('default-library migration serializes its read-modify-write with a competing library update', async () => {
    await storage.clearWorkspace();
    await storage.setSettings({
        'library-items': [{ id: 'existing-custom' }],
        'default-library-version': 0,
    });

    let migrationPromise;
    await storage.updateSettingsAtomically(
        ['library-items', 'default-library-version'],
        (current) => {
            migrationPromise = storage.updateSettingsAtomically(
                ['library-items', 'default-library-version'],
                (latest) => {
                    const migration = createDefaultLibraryMigration(
                        latest['library-items'],
                        latest['default-library-version'],
                        ({ id }) => ({ id }),
                    );
                    return migration ? {
                        'library-items': migration.libraryItems,
                        'default-library-version': migration.version,
                    } : null;
                },
            );
            return {
                'library-items': [...current['library-items'], { id: 'concurrent-custom' }],
                'default-library-version': current['default-library-version'],
            };
        },
    );
    await migrationPromise;

    const libraryItems = await storage.getSetting('library-items');
    assert.ok(libraryItems.some(({ id }) => id === 'existing-custom'));
    assert.ok(libraryItems.some(({ id }) => id === 'concurrent-custom'));
    assert.ok(libraryItems.some(({ id }) => id === 'irfan-core-aws-ec2-v1'));
    assert.equal(await storage.getSetting('default-library-version'), 1);
});

test('stale library writes apply their delta without removing a completed migration', async () => {
    await storage.clearWorkspace();
    const existing = { id: 'existing-custom', elements: [] };
    const localAddition = { id: 'local-addition', elements: [] };
    const staleLibrary = [existing];
    await storage.setSettings({
        'library-items': staleLibrary,
        'default-library-version': 0,
    });

    await storage.updateSettingsAtomically(
        ['library-items', 'default-library-version'],
        (settings) => {
            const migration = createDefaultLibraryMigration(
                settings['library-items'],
                settings['default-library-version'],
                ({ id }) => ({ id, elements: [] }),
            );
            return {
                'library-items': migration.libraryItems,
                'default-library-version': migration.version,
            };
        },
    );
    await storage.updateLibraryItems(staleLibrary, [...staleLibrary, localAddition]);

    const persisted = await storage.getSetting('library-items');
    assert.ok(persisted.some(({ id }) => id === 'existing-custom'));
    assert.ok(persisted.some(({ id }) => id === 'local-addition'));
    assert.ok(persisted.some(({ id }) => id === 'irfan-core-aws-ec2-v1'));
    assert.equal(await storage.getSetting('default-library-version'), 1);
});

test('rapid queued library snapshots preserve concurrent additions, edits, and deletions', async () => {
    await storage.clearWorkspace();
    const original = [
        { id: 'local', value: 'original' },
        { id: 'external-edit', value: 'original' },
        { id: 'external-delete', value: 'original' },
    ];
    const firstSnapshot = original.map((item) => item.id === 'local' ? { ...item, value: 'first' } : item);
    const secondSnapshot = firstSnapshot.map((item) => item.id === 'local' ? { ...item, value: 'second' } : item);
    await storage.setSetting('library-items', original);

    let releaseFirst;
    let signalEntered;
    const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
    const entered = new Promise((resolve) => { signalEntered = resolve; });
    let first = true;
    const queue = createSerializedDeltaQueue({
        initialValue: original,
        persist: async (previousItems, nextItems) => {
            if (first) {
                first = false;
                signalEntered();
                await firstGate;
            }
            const { updates } = await storage.updateLibraryItems(previousItems, nextItems);
            return updates['library-items'];
        },
    });

    const firstWrite = queue.enqueue(firstSnapshot);
    await entered;
    await storage.setSetting('library-items', [
        { id: 'local', value: 'original' },
        { id: 'external-edit', value: 'concurrent' },
        { id: 'external-add', value: 'concurrent' },
    ]);
    const secondWrite = queue.enqueue(secondSnapshot);
    releaseFirst();
    await Promise.all([firstWrite, secondWrite]);

    const persisted = await storage.getSetting('library-items');
    assert.deepEqual(persisted.find(({ id }) => id === 'local'), { id: 'local', value: 'second' });
    assert.deepEqual(persisted.find(({ id }) => id === 'external-edit'), { id: 'external-edit', value: 'concurrent' });
    assert.deepEqual(persisted.find(({ id }) => id === 'external-add'), { id: 'external-add', value: 'concurrent' });
    assert.equal(persisted.some(({ id }) => id === 'external-delete'), false);
});

test('atomic settings updates consume abort failures without changing persisted values', async () => {
    await storage.clearWorkspace();
    await storage.setSettings({
        'library-items': [{ id: 'preserved' }],
        'default-library-version': 0,
    });
    const unhandled = [];
    const captureUnhandled = (error) => unhandled.push(error);
    process.on('unhandledRejection', captureUnhandled);
    try {
        await assert.rejects(
            storage.updateSettingsAtomically(['library-items'], () => {
                throw new Error('migration failed');
            }),
            /migration failed/,
        );
        await assert.rejects(
            storage.updateSettingsAtomically(['library-items'], () => ({
                'library-items': [{ id: 'replacement' }],
                'undeclared-key': true,
            })),
            /undeclared key/,
        );
        await assert.rejects(
            storage.updateSettingsAtomically(
                ['library-items', 'default-library-version'],
                () => ({
                    'library-items': [{ id: 'replacement' }],
                    'default-library-version': () => undefined,
                }),
            ),
            /clone|function/i,
        );
        await assert.rejects(
            storage.setSettings({
                'library-items': [{ id: 'replacement' }],
                'default-library-version': () => undefined,
            }),
            /clone|function/i,
        );
        await new Promise((resolve) => setImmediate(resolve));
        await new Promise((resolve) => setImmediate(resolve));
    } finally {
        process.off('unhandledRejection', captureUnhandled);
    }

    assert.deepEqual(await storage.getSetting('library-items'), [{ id: 'preserved' }]);
    assert.equal(await storage.getSetting('default-library-version'), 0);
    assert.deepEqual(unhandled, []);
});

test('workspace scene maps preserve prototype-sensitive board ids as own keys', async () => {
    await storage.clearWorkspace();
    const dangerousBoard = board('__proto__');
    await storage.saveBoard(dangerousBoard, JSON.stringify(scene('__proto__')));

    const scenes = await storage.loadWorkspaceScenes([dangerousBoard]);
    assert.equal(Object.getPrototypeOf(scenes), null);
    assert.equal(Object.hasOwn(scenes, '__proto__'), true);
    assert.equal(scenes.__proto__.elements[0].id, 'shape-__proto__');
});

test('workspace replacement aborts and drains synchronous serialization failures', async () => {
    await storage.clearWorkspace();
    const originalBoard = board('original', 1);
    await storage.replaceWorkspace({
        boards: [originalBoard],
        scenes: { original: scene('original') },
        libraryItems: [{ id: 'original-library' }],
        installedPacks: ['systems-design'],
        defaultLibraryVersion: 1,
    });
    const unhandled = [];
    const captureUnhandled = (error) => unhandled.push(error);
    process.on('unhandledRejection', captureUnhandled);
    try {
        const replacementBoard = board('replacement', 2);
        const invalidScene = scene('replacement');
        invalidScene.invalid = 1n;
        await assert.rejects(
            storage.replaceWorkspace({
                boards: [replacementBoard],
                scenes: { replacement: invalidScene },
                libraryItems: [{ id: 'replacement-library' }],
                installedPacks: [],
                defaultLibraryVersion: 1,
            }),
            /BigInt/,
        );
        await new Promise((resolve) => setImmediate(resolve));
    } finally {
        process.off('unhandledRejection', captureUnhandled);
    }

    assert.deepEqual((await storage.listBoards()).map(({ id }) => id), ['original']);
    assert.equal((await storage.loadScene('original')).elements[0].id, 'shape-original');
    assert.deepEqual(await storage.getSetting('library-items'), [{ id: 'original-library' }]);
    assert.deepEqual(unhandled, []);
});

test('workspace replacement is atomic at the storage boundary and deletion removes scene data', async () => {
    const boards = [board('newer', 2), board('older', 1)];
    const scenes = { newer: scene('newer'), older: scene('older') };
    await storage.replaceWorkspace({
        boards,
        scenes,
        libraryItems: [{ id: 'library-item' }],
        installedPacks: ['systems-design'],
        defaultLibraryVersion: 1,
    });

    assert.deepEqual((await storage.listBoards()).map(({ id }) => id), ['newer', 'older']);
    assert.equal((await storage.loadWorkspaceScenes(boards)).older.elements[0].id, 'shape-older');
    assert.deepEqual(await storage.getSetting('installed-packs'), ['systems-design']);
    assert.equal(await storage.getSetting('default-library-version'), 1);

    await storage.deleteBoard('newer');
    assert.deepEqual((await storage.listBoards()).map(({ id }) => id), ['older']);
    assert.equal(await storage.loadScene('newer'), null);
});
