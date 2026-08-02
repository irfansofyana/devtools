const MAX_BOARD_NAME_LENGTH = 80;

export function normalizeBoardName(value) {
    const normalized = String(value ?? '').trim();
    return (normalized || 'Untitled diagram').slice(0, MAX_BOARD_NAME_LENGTH);
}

export function createBoard({ id, name, now = Date.now() }) {
    if (!id) throw new TypeError('A board id is required.');
    return {
        id,
        name: normalizeBoardName(name),
        createdAt: now,
        updatedAt: now,
        thumbnail: null,
    };
}

export function sortBoardsByUpdatedAt(boards) {
    return [...boards].sort((left, right) => right.updatedAt - left.updatedAt);
}
