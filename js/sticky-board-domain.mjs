export const BACKUP_TYPE = 'tools-sticky-workspace';
export const SCHEMA_VERSION = 2;

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const CARD_TYPES = new Set(['note', 'code']);
const CARD_COLORS = new Set(['yellow', 'blue', 'green', 'pink', 'purple', 'slate']);
const MAX_CONTENT_LENGTH = 200_000;

const DEFAULT_NOTE_DOCUMENT = {
    type: 'doc',
    content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'New note' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Capture the thought. Shape it later.' }] },
        {
            type: 'taskList',
            content: [{
                type: 'taskItem', attrs: { checked: false },
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First task' }] }],
            }],
        },
    ],
};

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

export function renormalizeZOrder(cards) {
    const ordered = [...cards].sort((left, right) => (
        left.z - right.z
        || left.createdAt - right.createdAt
        || left.id.localeCompare(right.id)
    ));
    ordered.forEach((card, index) => { card.z = index + 1; });
    return ordered.length;
}

export function listMarkdownTasks(content) {
    const tasks = [];
    let offset = 0;
    let fence = null;
    let listIndents = [];
    for (const line of String(content).split('\n')) {
        if (fence) {
            const closingFence = new RegExp(`^\\s{0,3}${fence.character}{${fence.length},}\\s*$`);
            if (closingFence.test(line)) fence = null;
        } else {
            const fenceMatch = line.match(/^\s{0,3}(`{3,}|~{3,})/);
            if (fenceMatch) {
                const marker = fenceMatch[1];
                fence = { character: marker[0], length: marker.length };
                listIndents = [];
            } else {
                const listMatch = line.match(/^(\s*)[-+*]\s+/);
                if (listMatch) {
                    const indent = listMatch[1].length;
                    while (listIndents.length && listIndents.at(-1) >= indent) listIndents.pop();
                    const nestedInList = listIndents.some((parentIndent) => parentIndent < indent);
                    const isListItem = indent <= 3 || nestedInList;
                    const taskMatch = line.match(/^(\s*[-+*]\s+)\[([ xX])\]/);
                    if (taskMatch && isListItem) {
                        tasks.push({
                            checked: taskMatch[2].toLowerCase() === 'x',
                            markIndex: offset + taskMatch[1].length + 1,
                        });
                    }
                    if (isListItem) listIndents.push(indent);
                    else listIndents = [];
                } else if (line.trim()) {
                    listIndents = [];
                }
            }
        }
        offset += line.length + 1;
    }
    return tasks;
}

export function toggleMarkdownTask(content, taskIndex, checked) {
    const value = String(content);
    const task = listMarkdownTasks(value)[taskIndex];
    if (!task) return value;
    return `${value.slice(0, task.markIndex)}${checked ? 'x' : ' '}${value.slice(task.markIndex + 1)}`;
}

export function annotateMarkdownTasks(content, nonce) {
    let value = String(content);
    const tasks = listMarkdownTasks(value);
    for (let index = tasks.length - 1; index >= 0; index -= 1) {
        const closingBracket = tasks[index].markIndex + 2;
        const followingSpace = value.slice(closingBracket).match(/^[ \t]+/)?.[0] ?? '';
        const insertionPoint = closingBracket + followingSpace.length;
        const marker = `<span data-sticky-task="${String(nonce)}:${index}"></span>`;
        value = `${value.slice(0, insertionPoint)}${marker}${value.slice(insertionPoint)}`;
    }
    return value;
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
    contentFormat,
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
        : structuredClone(DEFAULT_NOTE_DOCUMENT);
    const normalizedContent = isCode
        ? String(content ?? defaultContent).slice(0, MAX_CONTENT_LENGTH)
        : (isPlainRecord(content)
            ? structuredClone(content)
            : content === undefined ? defaultContent : String(content).slice(0, MAX_CONTENT_LENGTH));
    const card = {
        id,
        boardId,
        type,
        x: finite(x),
        y: finite(y),
        width: clamp(finite(width, isCode ? 420 : 300), 240, 1_200),
        height: clamp(finite(height, isCode ? 260 : 240), 170, 1_000),
        title: normalizeName(title, isCode ? 'Code snippet' : 'Sticky note'),
        content: normalizedContent,
        contentFormat: isCode
            ? 'plain-text'
            : (isPlainRecord(normalizedContent) ? 'tiptap-json' : (contentFormat === 'tiptap-json' ? 'tiptap-json' : 'markdown')),
        color: CARD_COLORS.has(color) ? color : (isCode ? 'slate' : 'yellow'),
        z: clamp(Math.round(finite(z, 1)), 1, 1_000_000),
        createdAt: timestamp,
        updatedAt: timestamp,
    };
    if (isCode) card.language = normalizeName(language, 'javascript').toLowerCase().slice(0, 40);
    return card;
}

export function richTextToPlainText(document) {
    const blockTypes = new Set(['doc', 'bulletList', 'orderedList', 'taskList', 'taskItem', 'blockquote']);
    const readNode = (node) => {
        if (!isPlainRecord(node)) return '';
        if (node.type === 'text') return typeof node.text === 'string' ? node.text : '';
        if (node.type === 'hardBreak') return '\n';
        if (!Array.isArray(node.content)) return '';
        const separator = blockTypes.has(node.type) ? '\n' : '';
        return node.content.map(readNode).filter(Boolean).join(separator);
    };
    return readNode(document).replace(/\n{3,}/g, '\n\n').trim();
}

export function migrateCard(card) {
    if (!isPlainRecord(card)) return card;
    const updates = {};
    if (Number.isFinite(card.width) && card.width < 240) updates.width = 240;
    if (Number.isFinite(card.height) && card.height < 170) updates.height = 170;
    if (!card.contentFormat) updates.contentFormat = card.type === 'note' ? 'markdown' : 'plain-text';
    const format = updates.contentFormat ?? card.contentFormat;
    if (card.type === 'note' && format === 'markdown' && typeof card.content === 'string' && typeof card.legacyMarkdown !== 'string') {
        updates.legacyMarkdown = card.content;
    }
    return Object.keys(updates).length ? { ...card, ...updates } : card;
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

function validRichTextDocument(document) {
    const nodeTypes = new Set(['doc', 'paragraph', 'text', 'heading', 'bulletList', 'orderedList', 'listItem', 'taskList', 'taskItem', 'blockquote', 'codeBlock', 'hardBreak', 'horizontalRule']);
    const markTypes = new Set(['bold', 'italic', 'strike', 'code', 'textStyle', 'link']);
    const validMark = (mark) => {
        if (!isPlainRecord(mark) || !markTypes.has(mark.type) || !Object.keys(mark).every((key) => ['type', 'attrs'].includes(key))) return false;
        const attrs = mark.attrs;
        if (['bold', 'italic', 'strike', 'code'].includes(mark.type)) return attrs === undefined || isPlainRecord(attrs) && Object.keys(attrs).length === 0;
        if (!isPlainRecord(attrs)) return false;
        if (mark.type === 'textStyle') {
            return Object.keys(attrs).every((key) => ['color', 'fontSize'].includes(key))
                && (attrs.color == null || /^#[0-9a-f]{6}$/i.test(attrs.color))
                && (attrs.fontSize == null || ['0.8rem', '0.95rem', '1.1rem', '1.35rem'].includes(attrs.fontSize));
        }
        return Object.keys(attrs).every((key) => ['href', 'target', 'rel', 'class'].includes(key))
            && typeof attrs.href === 'string'
            && /^(https?:|ftps?:|mailto:|tel:|sms:|callto:|cid:|xmpp:|\/|#)/i.test(attrs.href)
            && (attrs.target == null || attrs.target === '_blank')
            && (attrs.rel == null || ['noopener noreferrer', 'noopener noreferrer nofollow'].includes(attrs.rel))
            && attrs.class == null;
    };
    const allowedChildren = {
        doc: new Set(['paragraph', 'heading', 'bulletList', 'orderedList', 'taskList', 'blockquote', 'codeBlock', 'horizontalRule']),
        paragraph: new Set(['text', 'hardBreak']),
        heading: new Set(['text', 'hardBreak']),
        bulletList: new Set(['listItem']),
        orderedList: new Set(['listItem']),
        listItem: new Set(['paragraph', 'heading', 'bulletList', 'orderedList', 'blockquote', 'codeBlock', 'horizontalRule']),
        taskList: new Set(['taskItem']),
        taskItem: new Set(['paragraph', 'heading', 'bulletList', 'orderedList', 'taskList', 'blockquote', 'codeBlock', 'horizontalRule']),
        blockquote: new Set(['paragraph', 'heading', 'bulletList', 'orderedList', 'taskList', 'blockquote', 'codeBlock', 'horizontalRule']),
        codeBlock: new Set(['text']),
    };
    const leafTypes = new Set(['text', 'hardBreak', 'horizontalRule']);
    const validNode = (node, isRoot = false) => {
        if (!isPlainRecord(node) || !nodeTypes.has(node.type)) return false;
        if (!Object.keys(node).every((key) => ['type', 'attrs', 'content', 'marks', 'text'].includes(key))) return false;
        if (isRoot && node.type !== 'doc') return false;
        if (node.type === 'text' && (typeof node.text !== 'string' || node.text.length === 0)) return false;
        if (node.text !== undefined && node.type !== 'text') return false;
        if (node.marks !== undefined && (node.type !== 'text' || !Array.isArray(node.marks) || !node.marks.every(validMark))) return false;
        if (leafTypes.has(node.type) && node.content !== undefined) return false;
        if (node.content !== undefined && (!Array.isArray(node.content) || !node.content.every((child) => allowedChildren[node.type]?.has(child?.type) && validNode(child)))) return false;
        if (!leafTypes.has(node.type) && node.content === undefined && !['paragraph', 'heading'].includes(node.type)) return false;
        if (['bulletList', 'orderedList', 'taskList', 'listItem', 'taskItem', 'blockquote'].includes(node.type) && !node.content?.length) return false;
        if (['listItem', 'taskItem'].includes(node.type) && node.content?.[0]?.type !== 'paragraph') return false;
        if (node.attrs !== undefined && !isPlainRecord(node.attrs)) return false;
        const attrs = node.attrs ?? {};
        if (node.type === 'heading' && (!Object.keys(attrs).every((key) => key === 'level') || ![1, 2, 3].includes(attrs.level))) return false;
        if (node.type === 'orderedList' && (
            !Object.keys(attrs).every((key) => ['start', 'type'].includes(key))
            || attrs.start != null && (!Number.isInteger(attrs.start) || attrs.start < 1)
            || attrs.type != null && !['1', 'a', 'A', 'i', 'I'].includes(attrs.type)
        )) return false;
        if (node.type === 'taskItem' && (!Object.keys(attrs).every((key) => key === 'checked') || typeof attrs.checked !== 'boolean')) return false;
        if (node.type === 'codeBlock' && (!Object.keys(attrs).every((key) => key === 'language') || attrs.language != null && typeof attrs.language !== 'string')) return false;
        if (!['heading', 'orderedList', 'taskItem', 'codeBlock'].includes(node.type) && Object.keys(attrs).length) return false;
        return true;
    };
    return safeTree(document) && validNode(document, true);
}

function validCard(card, boardIds) {
    const allowed = new Set(['id', 'boardId', 'type', 'x', 'y', 'width', 'height', 'title', 'content', 'contentFormat', 'legacyMarkdown', 'language', 'color', 'z', 'createdAt', 'updatedAt']);
    const validContent = card?.type === 'code'
        ? card.contentFormat === 'plain-text' && typeof card.content === 'string' && card.content.length <= MAX_CONTENT_LENGTH
        : (
            card?.contentFormat === 'markdown' && typeof card.content === 'string' && card.content.length <= MAX_CONTENT_LENGTH
            || card?.contentFormat === 'tiptap-json'
                && isPlainRecord(card.content)
                && card.content.type === 'doc'
                && validRichTextDocument(card.content)
                && JSON.stringify(card.content).length <= MAX_CONTENT_LENGTH
        );
    return isPlainRecord(card)
        && Object.keys(card).every((key) => allowed.has(key))
        && validId(card.id)
        && validId(card.boardId)
        && boardIds.has(card.boardId)
        && CARD_TYPES.has(card.type)
        && Number.isFinite(card.x)
        && Number.isFinite(card.y)
        && Number.isFinite(card.width)
        && card.width >= 240
        && card.width <= 1_200
        && Number.isFinite(card.height)
        && card.height >= 170
        && card.height <= 1_000
        && typeof card.title === 'string'
        && card.title.length > 0
        && card.title.length <= 80
        && validContent
        && CARD_COLORS.has(card.color)
        && Number.isInteger(card.z)
        && card.z >= 1
        && card.z <= 1_000_000
        && Number.isFinite(card.createdAt)
        && Number.isFinite(card.updatedAt)
        && card.updatedAt >= card.createdAt
        && (card.legacyMarkdown === undefined || (card.type === 'note' && typeof card.legacyMarkdown === 'string' && card.legacyMarkdown.length <= MAX_CONTENT_LENGTH))
        && (card.type !== 'code' || (typeof card.language === 'string' && card.language.length > 0 && card.language.length <= 40))
        && (card.type !== 'note' || card.language === undefined);
}

export function validateWorkspaceBackup(value) {
    const candidate = value?.schemaVersion === 1
        ? { ...value, schemaVersion: SCHEMA_VERSION, cards: value.cards?.map(migrateCard) }
        : value;
    const boards = candidate?.boards;
    const cards = candidate?.cards;
    const boardIds = new Set(Array.isArray(boards) ? boards.map((board) => board?.id) : []);
    const cardIds = new Set(Array.isArray(cards) ? cards.map((card) => card?.id) : []);
    const valid = isPlainRecord(candidate)
        && safeTree(candidate)
        && Object.keys(candidate).every((key) => ['type', 'schemaVersion', 'exportedAt', 'currentBoardId', 'boards', 'cards'].includes(key))
        && candidate.type === BACKUP_TYPE
        && candidate.schemaVersion === SCHEMA_VERSION
        && Number.isFinite(candidate.exportedAt)
        && Array.isArray(boards)
        && boards.length > 0
        && boards.length <= 200
        && boardIds.size === boards.length
        && boards.every(validBoard)
        && validId(candidate.currentBoardId)
        && boardIds.has(candidate.currentBoardId)
        && Array.isArray(cards)
        && cards.length <= 5_000
        && cardIds.size === cards.length
        && cards.every((card) => validCard(card, boardIds));

    if (!valid) throw new TypeError('Invalid sticky-board backup.');
    return candidate;
}
