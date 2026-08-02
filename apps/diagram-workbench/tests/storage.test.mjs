import assert from 'node:assert/strict';
import test from 'node:test';
import 'fake-indexeddb/auto';

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
    await storage.setSetting('current-board-id', 'one');

    assert.deepEqual((await storage.listBoards()).map(({ id }) => id), ['one']);
    assert.equal((await storage.loadScene('one')).files['file-one'].mimeType, 'image/png');
    assert.equal(await storage.getSetting('current-board-id'), 'one');

    const request = indexedDB.open('tools-diagram-workbench');
    const db = await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
    assert.equal(db.version, 1);
    assert.deepEqual([...db.objectStoreNames], ['boards', 'scenes', 'settings']);
    db.close();
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

test('workspace replacement is atomic at the storage boundary and deletion removes scene data', async () => {
    const boards = [board('newer', 2), board('older', 1)];
    const scenes = { newer: scene('newer'), older: scene('older') };
    await storage.replaceWorkspace({ boards, scenes, libraryItems: [{ id: 'library-item' }], installedPacks: ['systems-design'] });

    assert.deepEqual((await storage.listBoards()).map(({ id }) => id), ['newer', 'older']);
    assert.equal((await storage.loadWorkspaceScenes(boards)).older.elements[0].id, 'shape-older');
    assert.deepEqual(await storage.getSetting('installed-packs'), ['systems-design']);

    await storage.deleteBoard('newer');
    assert.deepEqual((await storage.listBoards()).map(({ id }) => id), ['older']);
    assert.equal(await storage.loadScene('newer'), null);
});
