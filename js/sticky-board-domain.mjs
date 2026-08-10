export const BACKUP_TYPE = 'tools-sticky-workspace';
export const SCHEMA_VERSION = 1;

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const CARD_TYPES = new Set(['note', 'code']);
const CARD_COLORS = new Set(['yellow', 'blue', 'green', 'pink', 'purple', 'slate']);
const MAX_CONTENT_LENGTH = 200_000;

function finite(value, fallback = 0) {
    return Number.isFinite(value) ? value : fallback;
}

function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
}

function normalizeName(value, fallback) {
    const name = String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, 80);
    return name || fallback;
}

function validId(value) {
    return typeof value === 'string' && ID_PATTERN.test(value) && !FORBIDDEN_KEYS.has(value);
}

function isPlainRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function safeTree(value, depth = 0) {
    if (depth > 20) return false;
    if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return true;
    if (Array.isArray(value)) return value.length <= 10_000 && value.every((item) => safeTree(item, depth + 1));
    if (!isPlainRecord(value)) return false;
    return Object.entries(value).every(([key, item]) => !FORBIDDEN_KEYS.has(key) && safeTree(item, depth + 1));
}

export function normalizeViewport(value = {}) {
    return {
        x: finite(value.x),
        y: finite(value.y),
        zoom: clamp(finite(value.zoom, 1), 0.25, 2.5),
    };
}

export function createBoard({ id, name = 'Untitled board', now = Date.now(), viewport } = {}) {
    if (!validId(id)) throw new TypeError('A safe board id is required.');
    const timestamp = finite(now, Date.now());
    return {
        id,
        name: normalizeName(name, 'Untitled board'),
        createdAt: timestamp,
        updatedAt: timestamp,
        viewport: normalizeViewport(viewport),
    };
}

export function createCard({
    id,
    boardId = '',
    type = 'note',
    x = 80,
    y = 80,
    width,
    height,
    title,
    content,
    language,
    color,
    now = Date.now(),
    z = 1,
} = {}) {
    if (!validId(id)) throw new TypeError('A safe card id is required.');
    if (boardId && !validId(boardId)) throw new TypeError('A safe board id is required.');
    if (!CARD_TYPES.has(type)) throw new TypeError('Card type must be note or code.');
    const timestamp = finite(now, Date.now());
    const isCode = type === 'code';
    const defaultContent = isCode
        ? 'const idea = "Build something useful";\nconsole.log(idea);'
        : '## New note\n\nWrite with **Markdown**.\n\n- [ ] First task';
    const card = {
        id,
        boardId,
        type,
        x: finite(x),
        y: finite(y),
        width: clamp(finite(width, isCode ? 420 : 300), 220, 1_200),
        height: clamp(finite(height, isCode ? 260 : 240), 160, 1_000),
        title: normalizeName(title, isCode ? 'Code snippet' : 'Sticky note'),
        content: String(content ?? defaultContent).slice(0, MAX_CONTENT_LENGTH),
        color: CARD_COLORS.has(color) ? color : (isCode ? 'slate' : 'yellow'),
        z: clamp(Math.round(finite(z, 1)), 1, 1_000_000),
        createdAt: timestamp,
        updatedAt: timestamp,
    };
    if (isCode) card.language = normalizeName(language, 'javascript').toLowerCase().slice(0, 40);
    return card;
}

function validBoard(board) {
    return isPlainRecord(board)
        && Object.keys(board).every((key) => ['id', 'name', 'createdAt', 'updatedAt', 'viewport'].includes(key))
        && validId(board.id)
        && typeof board.name === 'string'
        && board.name === normalizeName(board.name, '')
        && board.name.length > 0
        && Number.isFinite(board.createdAt)
        && Number.isFinite(board.updatedAt)
        && board.updatedAt >= board.createdAt
        && isPlainRecord(board.viewport)
        && Object.keys(board.viewport).length === 3
        && Number.isFinite(board.viewport.x)
        && Number.isFinite(board.viewport.y)
        && Number.isFinite(board.viewport.zoom)
        && board.viewport.zoom >= 0.25
        && board.viewport.zoom <= 2.5;
}

function validCard(card, boardIds) {
    const allowed = new Set(['id', 'boardId', 'type', 'x', 'y', 'width', 'height', 'title', 'content', 'language', 'color', 'z', 'createdAt', 'updatedAt']);
    return isPlainRecord(card)
        && Object.keys(card).every((key) => allowed.has(key))
        && validId(card.id)
        && validId(card.boardId)
        && boardIds.has(card.boardId)
        && CARD_TYPES.has(card.type)
        && Number.isFinite(card.x)
        && Number.isFinite(card.y)
        && Number.isFinite(card.width)
        && card.width >= 220
        && card.width <= 1_200
        && Number.isFinite(card.height)
        && card.height >= 160
        && card.height <= 1_000
        && typeof card.title === 'string'
        && card.title.length > 0
        && card.title.length <= 80
        && typeof card.content === 'string'
        && card.content.length <= MAX_CONTENT_LENGTH
        && CARD_COLORS.has(card.color)
        && Number.isInteger(card.z)
        && card.z >= 1
        && card.z <= 1_000_000
        && Number.isFinite(card.createdAt)
        && Number.isFinite(card.updatedAt)
        && card.updatedAt >= card.createdAt
        && (card.type !== 'code' || (typeof card.language === 'string' && card.language.length > 0 && card.language.length <= 40))
        && (card.type !== 'note' || card.language === undefined);
}

export function validateWorkspaceBackup(value) {
    const boards = value?.boards;
    const cards = value?.cards;
    const boardIds = new Set(Array.isArray(boards) ? boards.map((board) => board?.id) : []);
    const cardIds = new Set(Array.isArray(cards) ? cards.map((card) => card?.id) : []);
    const valid = isPlainRecord(value)
        && safeTree(value)
        && Object.keys(value).every((key) => ['type', 'schemaVersion', 'exportedAt', 'currentBoardId', 'boards', 'cards'].includes(key))
        && value.type === BACKUP_TYPE
        && value.schemaVersion === SCHEMA_VERSION
        && Number.isFinite(value.exportedAt)
        && Array.isArray(boards)
        && boards.length > 0
        && boards.length <= 200
        && boardIds.size === boards.length
        && boards.every(validBoard)
        && validId(value.currentBoardId)
        && boardIds.has(value.currentBoardId)
        && Array.isArray(cards)
        && cards.length <= 5_000
        && cardIds.size === cards.length
        && cards.every((card) => validCard(card, boardIds));

    if (!valid) throw new TypeError('Invalid sticky-board backup.');
    return value;
}
