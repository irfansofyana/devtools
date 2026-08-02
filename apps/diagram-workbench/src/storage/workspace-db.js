import { openDB } from 'idb';
import { sortBoardsByUpdatedAt } from '../domain/boards.js';

const DATABASE_NAME = 'tools-diagram-workbench';
const DATABASE_VERSION = 1;
const BOARDS_STORE = 'boards';
const SCENES_STORE = 'scenes';
const SETTINGS_STORE = 'settings';

const database = openDB(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(db) {
        if (!db.objectStoreNames.contains(BOARDS_STORE)) db.createObjectStore(BOARDS_STORE, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(SCENES_STORE)) db.createObjectStore(SCENES_STORE, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(SETTINGS_STORE)) db.createObjectStore(SETTINGS_STORE);
    },
});

export async function listBoards() {
    const db = await database;
    return sortBoardsByUpdatedAt(await db.getAll(BOARDS_STORE));
}

export async function loadScene(id) {
    const db = await database;
    const record = await db.get(SCENES_STORE, id);
    if (!record?.json) return null;
    return JSON.parse(record.json);
}

export async function saveBoard(board, json) {
    const db = await database;
    const transaction = db.transaction([BOARDS_STORE, SCENES_STORE], 'readwrite');
    await Promise.all([
        transaction.objectStore(BOARDS_STORE).put(board),
        transaction.objectStore(SCENES_STORE).put({ id: board.id, json }),
        transaction.done,
    ]);
}

export async function deleteBoard(id) {
    const db = await database;
    const transaction = db.transaction([BOARDS_STORE, SCENES_STORE], 'readwrite');
    await Promise.all([
        transaction.objectStore(BOARDS_STORE).delete(id),
        transaction.objectStore(SCENES_STORE).delete(id),
        transaction.done,
    ]);
}

export async function getSetting(key, fallback = null) {
    const db = await database;
    const value = await db.get(SETTINGS_STORE, key);
    return value ?? fallback;
}

export async function setSetting(key, value) {
    const db = await database;
    await db.put(SETTINGS_STORE, value, key);
}

export async function loadWorkspaceScenes(boards) {
    const scenes = Object.create(null);
    for (const board of boards) {
        scenes[board.id] = await loadScene(board.id);
    }
    return scenes;
}

export async function replaceWorkspace({ boards, scenes, libraryItems, installedPacks }) {
    const db = await database;
    const transaction = db.transaction([BOARDS_STORE, SCENES_STORE, SETTINGS_STORE], 'readwrite');
    const boardsStore = transaction.objectStore(BOARDS_STORE);
    const scenesStore = transaction.objectStore(SCENES_STORE);
    const settingsStore = transaction.objectStore(SETTINGS_STORE);
    const operations = [boardsStore.clear(), scenesStore.clear(), settingsStore.clear()];

    for (const board of boards) {
        operations.push(boardsStore.put(board));
        operations.push(scenesStore.put({ id: board.id, json: JSON.stringify(scenes[board.id]) }));
    }
    operations.push(settingsStore.put(libraryItems, 'library-items'));
    operations.push(settingsStore.put(installedPacks, 'installed-packs'));
    operations.push(settingsStore.put(boards[0].id, 'current-board-id'));
    await Promise.all([...operations, transaction.done]);
}

export async function clearWorkspace() {
    const db = await database;
    const transaction = db.transaction([BOARDS_STORE, SCENES_STORE, SETTINGS_STORE], 'readwrite');
    await Promise.all([
        transaction.objectStore(BOARDS_STORE).clear(),
        transaction.objectStore(SCENES_STORE).clear(),
        transaction.objectStore(SETTINGS_STORE).clear(),
        transaction.done,
    ]);
}
