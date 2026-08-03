import { openDB } from 'idb';
import { applyLibraryItemsDelta } from '../domain/default-library.js';
import { sortBoardsByUpdatedAt } from '../domain/boards.js';

const DATABASE_NAME = 'tools-diagram-workbench';
const DATABASE_VERSION = 1;
const BOARDS_STORE = 'boards';
const SCENES_STORE = 'scenes';
const SETTINGS_STORE = 'settings';

async function abortAndDrainTransaction(transaction, requests = []) {
    try {
        transaction.abort();
    } catch {
        // The transaction may already have completed or aborted.
    }
    await Promise.allSettled(requests);
    await transaction.done.catch(() => undefined);
}

async function putSettingEntries(transaction, store, entries) {
    const requests = [];
    try {
        const clonedEntries = entries.map(([key, value]) => [key, structuredClone(value)]);
        for (const [key, value] of clonedEntries) {
            const request = store.put(value, key);
            request.catch(() => undefined);
            requests.push(request);
        }
        await Promise.all([...requests, transaction.done]);
    } catch (error) {
        await abortAndDrainTransaction(transaction, requests);
        throw error;
    }
}

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

export async function setSettings(settings) {
    const entries = Object.entries(settings);
    if (!entries.length) return;
    const db = await database;
    const transaction = db.transaction(SETTINGS_STORE, 'readwrite');
    const store = transaction.objectStore(SETTINGS_STORE);
    await putSettingEntries(transaction, store, entries);
}

export async function updateSettingsAtomically(keys, updater) {
    if (!Array.isArray(keys) || !keys.length || new Set(keys).size !== keys.length || keys.some((key) => typeof key !== 'string' || !key)) {
        throw new TypeError('Atomic setting keys must be unique non-empty strings.');
    }
    if (typeof updater !== 'function') throw new TypeError('Atomic settings updater must be a function.');

    const db = await database;
    const transaction = db.transaction(SETTINGS_STORE, 'readwrite');
    const store = transaction.objectStore(SETTINGS_STORE);
    const current = Object.create(null);
    let updates;
    let entries;
    try {
        const values = await Promise.all(keys.map((key) => store.get(key)));
        keys.forEach((key, index) => {
            current[key] = values[index];
        });
        updates = updater(current);
        if (updates !== null && (typeof updates !== 'object' || Array.isArray(updates))) {
            throw new TypeError('Atomic settings updater must return an object or null.');
        }
        entries = updates ? Object.entries(updates) : [];
        if (entries.some(([key]) => !keys.includes(key))) {
            throw new TypeError('Atomic settings updater returned an undeclared key.');
        }
    } catch (error) {
        await abortAndDrainTransaction(transaction);
        throw error;
    }
    await putSettingEntries(transaction, store, entries);
    return { current, updates };
}

export async function updateLibraryItems(previousItems, nextItems) {
    return updateSettingsAtomically(['library-items'], (settings) => ({
        'library-items': applyLibraryItemsDelta(settings['library-items'], previousItems, nextItems),
    }));
}

export async function loadWorkspaceScenes(boards) {
    const scenes = Object.create(null);
    for (const board of boards) {
        scenes[board.id] = await loadScene(board.id);
    }
    return scenes;
}

export async function replaceWorkspace({ boards, scenes, libraryItems, installedPacks, defaultLibraryVersion = 0 }) {
    if (!Array.isArray(boards) || boards.length === 0) throw new TypeError('Workspace replacement requires at least one board.');
    const preparedBoards = structuredClone(boards);
    const preparedScenes = preparedBoards.map((board) => ({
        id: board.id,
        json: JSON.stringify(scenes[board.id]),
    }));
    const preparedLibraryItems = structuredClone(libraryItems);
    const preparedInstalledPacks = structuredClone(installedPacks);
    const preparedDefaultLibraryVersion = structuredClone(defaultLibraryVersion);

    const db = await database;
    const transaction = db.transaction([BOARDS_STORE, SCENES_STORE, SETTINGS_STORE], 'readwrite');
    const boardsStore = transaction.objectStore(BOARDS_STORE);
    const scenesStore = transaction.objectStore(SCENES_STORE);
    const settingsStore = transaction.objectStore(SETTINGS_STORE);
    const requests = [];
    const track = (request) => {
        request.catch(() => undefined);
        requests.push(request);
    };
    try {
        track(boardsStore.clear());
        track(scenesStore.clear());
        track(settingsStore.clear());
        preparedBoards.forEach((board, index) => {
            track(boardsStore.put(board));
            track(scenesStore.put(preparedScenes[index]));
        });
        track(settingsStore.put(preparedLibraryItems, 'library-items'));
        track(settingsStore.put(preparedInstalledPacks, 'installed-packs'));
        track(settingsStore.put(preparedDefaultLibraryVersion, 'default-library-version'));
        track(settingsStore.put(preparedBoards[0].id, 'current-board-id'));
        await Promise.all([...requests, transaction.done]);
    } catch (error) {
        await abortAndDrainTransaction(transaction, requests);
        throw error;
    }
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
