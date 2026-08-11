const DB_NAME = 'tools-sticky-board';
const DB_VERSION = 1;

let databasePromise;

function requestResult(request) {
    return new Promise((resolve, reject) => {
        request.addEventListener('success', () => resolve(request.result), { once: true });
        request.addEventListener('error', () => reject(request.error), { once: true });
    });
}

function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
        transaction.addEventListener('complete', () => resolve(), { once: true });
        transaction.addEventListener('abort', () => reject(transaction.error ?? new Error('Storage transaction aborted.')), { once: true });
        transaction.addEventListener('error', () => reject(transaction.error ?? new Error('Storage transaction failed.')), { once: true });
    });
}

export function openDatabase() {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.addEventListener('upgradeneeded', () => {
            const database = request.result;
            if (!database.objectStoreNames.contains('boards')) database.createObjectStore('boards', { keyPath: 'id' });
            if (!database.objectStoreNames.contains('cards')) {
                const cards = database.createObjectStore('cards', { keyPath: 'id' });
                cards.createIndex('boardId', 'boardId', { unique: false });
            }
            if (!database.objectStoreNames.contains('settings')) database.createObjectStore('settings', { keyPath: 'key' });
        });
        request.addEventListener('success', () => resolve(request.result), { once: true });
        request.addEventListener('error', () => {
            databasePromise = undefined;
            reject(request.error);
        }, { once: true });
        request.addEventListener('blocked', () => {
            databasePromise = undefined;
            reject(new Error('Sticky-board storage upgrade was blocked by another tab.'));
        }, { once: true });
    });
    return databasePromise;
}

async function getAll(storeName) {
    const database = await openDatabase();
    const transaction = database.transaction(storeName, 'readonly');
    return requestResult(transaction.objectStore(storeName).getAll());
}

export async function listBoards() {
    const boards = await getAll('boards');
    return boards.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function listCards(boardId) {
    const database = await openDatabase();
    const transaction = database.transaction('cards', 'readonly');
    return requestResult(transaction.objectStore('cards').index('boardId').getAll(boardId));
}

async function put(storeName, value) {
    structuredClone(value);
    const database = await openDatabase();
    const transaction = database.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).put(value);
    await transactionDone(transaction);
    return value;
}

export const saveBoard = (board) => put('boards', board);
export const saveCard = (card) => put('cards', card);

export async function deleteCards(ids) {
    const database = await openDatabase();
    const transaction = database.transaction('cards', 'readwrite');
    const store = transaction.objectStore('cards');
    ids.forEach((id) => store.delete(id));
    await transactionDone(transaction);
}

export async function deleteCard(id) {
    return deleteCards([id]);
}

export async function deleteBoard(id) {
    const database = await openDatabase();
    const transaction = database.transaction(['boards', 'cards'], 'readwrite');
    transaction.objectStore('boards').delete(id);
    const cardStore = transaction.objectStore('cards');
    const cursorRequest = cardStore.index('boardId').openKeyCursor(IDBKeyRange.only(id));
    cursorRequest.addEventListener('success', () => {
        const cursor = cursorRequest.result;
        if (!cursor) return;
        cardStore.delete(cursor.primaryKey);
        cursor.continue();
    });
    await transactionDone(transaction);
}

export async function getSetting(key, fallback = null) {
    const database = await openDatabase();
    const transaction = database.transaction('settings', 'readonly');
    const result = await requestResult(transaction.objectStore('settings').get(key));
    return result?.value ?? fallback;
}

export async function setSetting(key, value) {
    return put('settings', { key, value });
}

export async function exportWorkspace() {
    const [boards, cards, currentBoardId] = await Promise.all([
        getAll('boards'),
        getAll('cards'),
        getSetting('current-board-id'),
    ]);
    return { boards, cards, currentBoardId };
}

export async function replaceWorkspace({ boards, cards, currentBoardId }) {
    structuredClone({ boards, cards, currentBoardId });
    const database = await openDatabase();
    const transaction = database.transaction(['boards', 'cards', 'settings'], 'readwrite');
    const boardStore = transaction.objectStore('boards');
    const cardStore = transaction.objectStore('cards');
    const settingStore = transaction.objectStore('settings');
    boardStore.clear();
    cardStore.clear();
    boards.forEach((board) => boardStore.put(board));
    cards.forEach((card) => cardStore.put(card));
    settingStore.put({ key: 'current-board-id', value: currentBoardId });
    await transactionDone(transaction);
}
