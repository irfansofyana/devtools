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

export function filterBoards(boards, query) {
    const needle = String(query ?? '').trim().toLocaleLowerCase();
    if (!needle) return [...boards];
    return boards.filter(({ name }) => String(name ?? '').toLocaleLowerCase().includes(needle));
}

export function createCopyName(name, existingNames = []) {
    const source = normalizeBoardName(name);
    const names = new Set(existingNames.map((item) => String(item).toLocaleLowerCase()));
    for (let index = 1; index <= names.size + 1; index += 1) {
        const suffix = index === 1 ? ' copy' : ` copy ${index}`;
        const base = source.slice(0, MAX_BOARD_NAME_LENGTH - suffix.length).trimEnd() || 'Diagram';
        const candidate = `${base}${suffix}`;
        if (!names.has(candidate.toLocaleLowerCase())) return candidate;
    }
    throw new Error('Could not create a unique board copy name.');
}
