export const BACKUP_TYPE = 'tools-sticky-workspace';
export const SCHEMA_VERSION = 4;

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const CARD_TYPES = new Set(['note', 'code']);
const CARD_COLORS = new Set(['yellow', 'blue', 'green', 'pink', 'purple', 'slate']);
const SHAPE_KINDS = new Set(['rectangle', 'rounded', 'ellipse', 'diamond', 'text']);
const SHAPE_FILLS = new Set(['yellow', 'blue', 'green', 'pink', 'purple', 'slate', 'transparent']);
const STROKE_COLORS = new Set(['ink', 'red', 'blue', 'green', 'purple', 'orange', 'transparent']);
const STROKE_STYLES = new Set(['solid', 'dashed']);
const CONNECTOR_ANCHORS = new Set(['top', 'right', 'bottom', 'left']);
const CONNECTOR_ARROWS = new Set(['end', 'none']);
const MAX_CONTENT_LENGTH = 200_000;
const MAX_SHAPE_LABEL_LENGTH = 500;
const FRAME_COLORS = new Set(['slate', 'blue', 'green', 'pink', 'purple', 'yellow']);

export const SHAPE_GEOMETRY = Object.freeze({
    minWidth: 80,
    minHeight: 60,
    maxWidth: 1_200,
    maxHeight: 1_000,
});

export const FRAME_GEOMETRY = Object.freeze({
    minWidth: 240,
    minHeight: 180,
    maxWidth: 4_000,
    maxHeight: 3_000,
});

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

export function createShape({
    id,
    boardId = '',
    shape = 'rectangle',
    x = 80,
    y = 80,
    width,
    height,
    label,
    fill,
    stroke,
    strokeStyle = 'solid',
    now = Date.now(),
    z = 1,
} = {}) {
    if (!validId(id)) throw new TypeError('A safe shape id is required.');
    if (boardId && !validId(boardId)) throw new TypeError('A safe board id is required.');
    if (!SHAPE_KINDS.has(shape)) throw new TypeError('A supported shape kind is required.');
    const timestamp = finite(now, Date.now());
    const isText = shape === 'text';
    const defaultSize = isText ? { width: 240, height: 80 } : { width: shape === 'diamond' ? 180 : 220, height: shape === 'diamond' ? 140 : 120 };
    const defaultLabel = isText ? 'Text' : 'Shape';
    const normalizedLabel = label === undefined ? defaultLabel : String(label).trim().slice(0, MAX_SHAPE_LABEL_LENGTH);
    return {
        id,
        boardId,
        type: 'shape',
        shape,
        x: finite(x),
        y: finite(y),
        width: clamp(finite(width, defaultSize.width), SHAPE_GEOMETRY.minWidth, SHAPE_GEOMETRY.maxWidth),
        height: clamp(finite(height, defaultSize.height), SHAPE_GEOMETRY.minHeight, SHAPE_GEOMETRY.maxHeight),
        label: normalizedLabel,
        fill: isText ? 'transparent' : (SHAPE_FILLS.has(fill) ? fill : 'blue'),
        stroke: isText ? 'transparent' : (STROKE_COLORS.has(stroke) ? stroke : 'ink'),
        strokeStyle: STROKE_STYLES.has(strokeStyle) ? strokeStyle : 'solid',
        z: clamp(Math.round(finite(z, 1)), 1, 1_000_000),
        createdAt: timestamp,
        updatedAt: timestamp,
    };
}

export function createFrame({
    id,
    boardId = '',
    label = 'Frame',
    x = 80,
    y = 80,
    width = 640,
    height = 420,
    color = 'slate',
    now = Date.now(),
    z = 1,
} = {}) {
    if (!validId(id)) throw new TypeError('A safe frame id is required.');
    if (boardId && !validId(boardId)) throw new TypeError('A safe board id is required.');
    const timestamp = finite(now, Date.now());
    return {
        id, boardId, type: 'frame', label: normalizeName(label, 'Frame'),
        x: finite(x), y: finite(y),
        width: clamp(finite(width, 640), FRAME_GEOMETRY.minWidth, FRAME_GEOMETRY.maxWidth),
        height: clamp(finite(height, 420), FRAME_GEOMETRY.minHeight, FRAME_GEOMETRY.maxHeight),
        color: FRAME_COLORS.has(color) ? color : 'slate',
        z: clamp(Math.round(finite(z, 1)), 1, 1_000_000),
        createdAt: timestamp, updatedAt: timestamp,
    };
}

function spatialEntities(entities) {
    return entities.filter((entity) => entity?.type !== 'connector'
        && Number.isFinite(entity?.x) && Number.isFinite(entity?.y)
        && Number.isFinite(entity?.width) && Number.isFinite(entity?.height));
}

export function entitiesInSelectionRect(entities, rect) {
    const left = Math.min(finite(rect?.left), finite(rect?.right));
    const right = Math.max(finite(rect?.left), finite(rect?.right));
    const top = Math.min(finite(rect?.top), finite(rect?.bottom));
    const bottom = Math.max(finite(rect?.top), finite(rect?.bottom));
    return spatialEntities(entities).filter((entity) => {
        const entityRight = entity.x + entity.width;
        const entityBottom = entity.y + entity.height;
        if (entity.type === 'frame') {
            return left <= entity.x && top <= entity.y && right >= entityRight && bottom >= entityBottom;
        }
        return entityRight >= left && entity.x <= right && entityBottom >= top && entity.y <= bottom;
    });
}

export function expandSelection(entityIds, entities) {
    const selected = new Set(entityIds);
    const groupIds = new Set(spatialEntities(entities)
        .filter((entity) => selected.has(entity.id) && entity.groupId)
        .map((entity) => entity.groupId));
    spatialEntities(entities).forEach((entity) => {
        if (entity.groupId && groupIds.has(entity.groupId)) selected.add(entity.id);
    });
    return selected;
}

export function groupEntities(entities, entityIds, groupId) {
    if (!validId(groupId)) throw new TypeError('A safe group id is required.');
    const selected = new Set(entityIds);
    const changed = spatialEntities(entities).filter((entity) => selected.has(entity.id));
    if (changed.length < 2) throw new TypeError('A group needs at least two objects.');
    changed.forEach((entity) => { entity.groupId = groupId; });
    return changed;
}

export function ungroupEntities(entities, entityIds) {
    const selected = expandSelection(entityIds, entities);
    const changed = spatialEntities(entities).filter((entity) => selected.has(entity.id) && entity.groupId);
    changed.forEach((entity) => { delete entity.groupId; });
    return changed;
}

function selectionUnits(entities) {
    const units = new Map();
    spatialEntities(entities).forEach((entity) => {
        const key = entity.groupId ? `group:${entity.groupId}` : `entity:${entity.id}`;
        const unit = units.get(key) ?? { entities: [], left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
        unit.entities.push(entity);
        unit.left = Math.min(unit.left, entity.x);
        unit.top = Math.min(unit.top, entity.y);
        unit.right = Math.max(unit.right, entity.x + entity.width);
        unit.bottom = Math.max(unit.bottom, entity.y + entity.height);
        units.set(key, unit);
    });
    return [...units.values()];
}

function moveUnit(unit, dx, dy) {
    unit.entities.forEach((entity) => { entity.x += dx; entity.y += dy; });
}

export function alignEntities(entities, alignment) {
    const units = selectionUnits(entities);
    if (units.length < 2) return spatialEntities(entities);
    const left = Math.min(...units.map((unit) => unit.left));
    const top = Math.min(...units.map((unit) => unit.top));
    const right = Math.max(...units.map((unit) => unit.right));
    const bottom = Math.max(...units.map((unit) => unit.bottom));
    units.forEach((unit) => {
        if (alignment === 'left') moveUnit(unit, left - unit.left, 0);
        else if (alignment === 'center') moveUnit(unit, (left + right - unit.left - unit.right) / 2, 0);
        else if (alignment === 'right') moveUnit(unit, right - unit.right, 0);
        else if (alignment === 'top') moveUnit(unit, 0, top - unit.top);
        else if (alignment === 'middle') moveUnit(unit, 0, (top + bottom - unit.top - unit.bottom) / 2);
        else if (alignment === 'bottom') moveUnit(unit, 0, bottom - unit.bottom);
        else throw new TypeError('Unsupported alignment.');
    });
    return spatialEntities(entities);
}

export function distributeEntities(entities, axis) {
    const horizontal = axis === 'horizontal';
    if (!horizontal && axis !== 'vertical') throw new TypeError('Unsupported distribution axis.');
    const units = selectionUnits(entities).sort((left, right) => horizontal ? left.left - right.left : left.top - right.top);
    if (units.length < 3) return spatialEntities(entities);
    const start = horizontal ? units[0].left : units[0].top;
    const end = horizontal ? units.at(-1).right : units.at(-1).bottom;
    const occupied = units.reduce((total, unit) => total + (horizontal ? unit.right - unit.left : unit.bottom - unit.top), 0);
    const gap = Math.max(0, (end - start - occupied) / (units.length - 1));
    let cursor = start;
    units.forEach((unit) => {
        const width = unit.right - unit.left;
        const height = unit.bottom - unit.top;
        moveUnit(unit, horizontal ? cursor - unit.left : 0, horizontal ? 0 : cursor - unit.top);
        cursor += (horizontal ? width : height) + gap;
    });
    return spatialEntities(entities);
}

export function createConnector({
    id,
    boardId = '',
    from,
    to,
    label = '',
    stroke = 'ink',
    strokeStyle = 'solid',
    arrow = 'end',
    now = Date.now(),
    z = 1,
} = {}) {
    if (!validId(id)) throw new TypeError('A safe connector id is required.');
    if (boardId && !validId(boardId)) throw new TypeError('A safe board id is required.');
    if (!isPlainRecord(from) || !validId(from.entityId) || !CONNECTOR_ANCHORS.has(from.anchor)) throw new TypeError('A valid connector start is required.');
    if (!isPlainRecord(to) || !validId(to.entityId) || !CONNECTOR_ANCHORS.has(to.anchor)) throw new TypeError('A valid connector end is required.');
    if (from.entityId === to.entityId) throw new TypeError('A connector needs two different entities.');
    const timestamp = finite(now, Date.now());
    return {
        id,
        boardId,
        type: 'connector',
        from: { entityId: from.entityId, anchor: from.anchor },
        to: { entityId: to.entityId, anchor: to.anchor },
        label: String(label).trim().slice(0, 120),
        stroke: STROKE_COLORS.has(stroke) && stroke !== 'transparent' ? stroke : 'ink',
        strokeStyle: STROKE_STYLES.has(strokeStyle) ? strokeStyle : 'solid',
        arrow: CONNECTOR_ARROWS.has(arrow) ? arrow : 'end',
        z: clamp(Math.round(finite(z, 1)), 1, 1_000_000),
        createdAt: timestamp,
        updatedAt: timestamp,
    };
}

export function chooseConnectorAnchors(fromEntity, toEntity) {
    const fromCenter = { x: fromEntity.x + fromEntity.width / 2, y: fromEntity.y + fromEntity.height / 2 };
    const toCenter = { x: toEntity.x + toEntity.width / 2, y: toEntity.y + toEntity.height / 2 };
    const dx = toCenter.x - fromCenter.x;
    const dy = toCenter.y - fromCenter.y;
    if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? { from: 'right', to: 'left' } : { from: 'left', to: 'right' };
    return dy >= 0 ? { from: 'bottom', to: 'top' } : { from: 'top', to: 'bottom' };
}

function anchorPoint(entity, anchor) {
    if (anchor === 'top') return { x: entity.x + entity.width / 2, y: entity.y };
    if (anchor === 'right') return { x: entity.x + entity.width, y: entity.y + entity.height / 2 };
    if (anchor === 'bottom') return { x: entity.x + entity.width / 2, y: entity.y + entity.height };
    return { x: entity.x, y: entity.y + entity.height / 2 };
}

export function resolveConnectorGeometry(connector, entities) {
    const lookup = entities instanceof Map ? entities : new Map(entities.map((entity) => [entity.id, entity]));
    const fromEntity = lookup.get(connector.from.entityId);
    const toEntity = lookup.get(connector.to.entityId);
    if (!fromEntity || !toEntity || fromEntity.type === 'connector' || toEntity.type === 'connector') return null;
    const start = anchorPoint(fromEntity, connector.from.anchor);
    const end = anchorPoint(toEntity, connector.to.anchor);
    return { x1: start.x, y1: start.y, x2: end.x, y2: end.y };
}

export function hasVisibleCanvasEntity(entities, rawViewport, size) {
    const currentViewport = normalizeViewport(rawViewport);
    const width = Math.max(0, finite(size?.width));
    const height = Math.max(0, finite(size?.height));
    return entities.some((entity) => {
        if (entity?.type === 'connector' || !Number.isFinite(entity?.x) || !Number.isFinite(entity?.y) || !Number.isFinite(entity?.width) || !Number.isFinite(entity?.height)) return false;
        const left = currentViewport.x + entity.x * currentViewport.zoom;
        const top = currentViewport.y + entity.y * currentViewport.zoom;
        const right = left + entity.width * currentViewport.zoom;
        const bottom = top + entity.height * currentViewport.zoom;
        return right >= 0 && bottom >= 0 && left <= width && top <= height;
    });
}

export function collectDeletionIds(entityId, entities) {
    const entity = entities.find((item) => item.id === entityId);
    if (!entity || entity.type === 'connector') return entity ? [entityId] : [];
    return [entityId, ...entities
        .filter((item) => item.type === 'connector' && (item.from.entityId === entityId || item.to.entityId === entityId))
        .map((item) => item.id)];
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
    if (!isPlainRecord(card) || !CARD_TYPES.has(card.type)) return card;
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
        if (!leafTypes.has(node.type) && node.content === undefined && !['paragraph', 'heading', 'codeBlock'].includes(node.type)) return false;
        if (node.type === 'doc' && !node.content?.length) return false;
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
    const allowed = new Set(['id', 'boardId', 'type', 'x', 'y', 'width', 'height', 'title', 'content', 'contentFormat', 'legacyMarkdown', 'language', 'color', 'groupId', 'z', 'createdAt', 'updatedAt']);
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
        && (card.groupId === undefined || validId(card.groupId))
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

function validShape(shape, boardIds) {
    const allowed = new Set(['id', 'boardId', 'type', 'shape', 'x', 'y', 'width', 'height', 'label', 'fill', 'stroke', 'strokeStyle', 'groupId', 'z', 'createdAt', 'updatedAt']);
    return isPlainRecord(shape)
        && Object.keys(shape).every((key) => allowed.has(key))
        && validId(shape.id)
        && validId(shape.boardId)
        && boardIds.has(shape.boardId)
        && shape.type === 'shape'
        && SHAPE_KINDS.has(shape.shape)
        && Number.isFinite(shape.x)
        && Number.isFinite(shape.y)
        && Number.isFinite(shape.width)
        && shape.width >= SHAPE_GEOMETRY.minWidth
        && shape.width <= SHAPE_GEOMETRY.maxWidth
        && Number.isFinite(shape.height)
        && shape.height >= SHAPE_GEOMETRY.minHeight
        && shape.height <= SHAPE_GEOMETRY.maxHeight
        && typeof shape.label === 'string'
        && shape.label.length <= MAX_SHAPE_LABEL_LENGTH
        && SHAPE_FILLS.has(shape.fill)
        && STROKE_COLORS.has(shape.stroke)
        && STROKE_STYLES.has(shape.strokeStyle)
        && (shape.groupId === undefined || validId(shape.groupId))
        && (shape.shape !== 'text' || shape.fill === 'transparent' && shape.stroke === 'transparent')
        && Number.isInteger(shape.z)
        && shape.z >= 1
        && shape.z <= 1_000_000
        && Number.isFinite(shape.createdAt)
        && Number.isFinite(shape.updatedAt)
        && shape.updatedAt >= shape.createdAt;
}

function validFrame(frame, boardIds) {
    const allowed = new Set(['id', 'boardId', 'type', 'label', 'x', 'y', 'width', 'height', 'color', 'groupId', 'z', 'createdAt', 'updatedAt']);
    return isPlainRecord(frame)
        && Object.keys(frame).every((key) => allowed.has(key))
        && validId(frame.id)
        && validId(frame.boardId)
        && boardIds.has(frame.boardId)
        && frame.type === 'frame'
        && typeof frame.label === 'string'
        && frame.label.length > 0
        && frame.label.length <= 80
        && Number.isFinite(frame.x)
        && Number.isFinite(frame.y)
        && Number.isFinite(frame.width)
        && frame.width >= FRAME_GEOMETRY.minWidth
        && frame.width <= FRAME_GEOMETRY.maxWidth
        && Number.isFinite(frame.height)
        && frame.height >= FRAME_GEOMETRY.minHeight
        && frame.height <= FRAME_GEOMETRY.maxHeight
        && FRAME_COLORS.has(frame.color)
        && (frame.groupId === undefined || validId(frame.groupId))
        && Number.isInteger(frame.z)
        && frame.z >= 1
        && frame.z <= 1_000_000
        && Number.isFinite(frame.createdAt)
        && Number.isFinite(frame.updatedAt)
        && frame.updatedAt >= frame.createdAt;
}

function validConnector(connector, boardIds, entityById) {
    const allowed = new Set(['id', 'boardId', 'type', 'from', 'to', 'label', 'stroke', 'strokeStyle', 'arrow', 'z', 'createdAt', 'updatedAt']);
    const validEndpoint = (endpoint) => isPlainRecord(endpoint)
        && Object.keys(endpoint).length === 2
        && validId(endpoint.entityId)
        && CONNECTOR_ANCHORS.has(endpoint.anchor);
    if (!isPlainRecord(connector)
        || !Object.keys(connector).every((key) => allowed.has(key))
        || !validId(connector.id)
        || !validId(connector.boardId)
        || !boardIds.has(connector.boardId)
        || connector.type !== 'connector'
        || !validEndpoint(connector.from)
        || !validEndpoint(connector.to)
        || connector.from.entityId === connector.to.entityId
        || typeof connector.label !== 'string'
        || connector.label.length > 120
        || !STROKE_COLORS.has(connector.stroke)
        || connector.stroke === 'transparent'
        || !STROKE_STYLES.has(connector.strokeStyle)
        || !CONNECTOR_ARROWS.has(connector.arrow)
        || !Number.isInteger(connector.z)
        || connector.z < 1
        || connector.z > 1_000_000
        || !Number.isFinite(connector.createdAt)
        || !Number.isFinite(connector.updatedAt)
        || connector.updatedAt < connector.createdAt) return false;
    const fromEntity = entityById.get(connector.from.entityId);
    const toEntity = entityById.get(connector.to.entityId);
    return Boolean(fromEntity && toEntity
        && fromEntity.type !== 'connector'
        && toEntity.type !== 'connector'
        && fromEntity.boardId === connector.boardId
        && toEntity.boardId === connector.boardId);
}

function validEntity(entity, boardIds, entityById) {
    if (entity?.type === 'shape') return validShape(entity, boardIds);
    if (entity?.type === 'frame') return validFrame(entity, boardIds);
    if (entity?.type === 'connector') return validConnector(entity, boardIds, entityById);
    return validCard(entity, boardIds);
}

export function validateWorkspaceBackup(value) {
    const candidate = [1, 2, 3].includes(value?.schemaVersion)
        ? { ...value, schemaVersion: SCHEMA_VERSION, cards: value.cards?.map(migrateCard) }
        : value;
    const boards = candidate?.boards;
    const cards = candidate?.cards;
    const boardIds = new Set(Array.isArray(boards) ? boards.map((board) => board?.id) : []);
    const cardIds = new Set(Array.isArray(cards) ? cards.map((card) => card?.id) : []);
    const entityById = new Map(Array.isArray(cards) ? cards.map((entity) => [entity?.id, entity]) : []);
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
        && cards.every((entity) => validEntity(entity, boardIds, entityById));

    if (!valid) throw new TypeError('Invalid sticky-board backup.');
    return candidate;
}
