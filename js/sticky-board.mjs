import {
    BACKUP_TYPE,
    SCHEMA_VERSION,
    SHAPE_GEOMETRY,
    chooseConnectorAnchors,
    collectDeletionIds,
    createBoard,
    createCard,
    createConnector,
    createShape,
    hasVisibleCanvasEntity,
    migrateCard,
    normalizeViewport,
    renormalizeZOrder,
    resolveConnectorGeometry,
    richTextToPlainText,
    validateWorkspaceBackup,
} from './sticky-board-domain.mjs';
import { createNoteEditor } from '../vendor/sticky-board/tiptap-editor.mjs';
import {
    deleteBoard,
    deleteCards,
    exportWorkspace,
    getSetting,
    listBoards,
    listCards,
    replaceWorkspace,
    saveBoard,
    saveCard,
    setSetting,
} from './sticky-board-storage.mjs';

const $ = (selector, root = document) => root.querySelector(selector);
const canvas = $('#sticky-canvas');
const surface = $('#canvas-surface');
const statusElement = $('#storage-status');
const boardSelect = $('#board-select');
const cardTemplate = $('#card-template');
const shapeTemplate = $('#shape-template');
const connectorLayer = $('#connector-layer');
const connectorToolbar = $('#connector-toolbar');
const searchInput = $('#card-search');
const SAVE_DELAY = 450;
const TEXT_COLORS = new Set(['ink', 'red', 'blue', 'green', 'purple', 'orange']);
const noteEditors = new Map();
const unsavableNoteIds = new Set();

let boards = [];
let cards = [];
let currentBoard = null;
let viewport = { x: 0, y: 0, zoom: 1 };
let topZ = 1;
let writeQueue = Promise.resolve();
let saveTimer = null;
let boardTimer = null;
let retryTimer = null;
let interaction = null;
let boardBusyDepth = 0;
let activeTool = 'select';
let connectorStartId = null;
let selectedConnectorId = null;

window.marked.setOptions({ gfm: true, breaks: true });

function uuid() {
    return crypto.randomUUID();
}

function setStatus(message) {
    statusElement.textContent = message;
}

function hasDirtyChanges() {
    return Boolean(currentBoard?.updatedAtDirty || cards.some((card) => card.updatedAtDirty));
}

function refreshSaveStatus() {
    if (unsavableNoteIds.size) {
        setStatus('A note is too large to save — shorten it before leaving');
        return;
    }
    if (hasDirtyChanges() || saveTimer || boardTimer) {
        setStatus('Unsaved changes');
        return;
    }
    window.clearTimeout(retryTimer);
    retryTimer = null;
    setStatus('Saved locally');
}

function canUseDurableNotes() {
    if (!unsavableNoteIds.size) return true;
    noteEditors.get(unsavableNoteIds.values().next().value)?.focus();
    refreshSaveStatus();
    return false;
}

function scheduleRetry() {
    if (!hasDirtyChanges()) return;
    window.clearTimeout(retryTimer);
    retryTimer = window.setTimeout(() => {
        retryTimer = null;
        flushSaves().catch(() => undefined);
    }, 5_000);
}

function queueWrite(operation) {
    setStatus('Saving locally…');
    writeQueue = writeQueue.catch(() => undefined).then(operation).then(() => {
        refreshSaveStatus();
    }).catch((error) => {
        setStatus('Local save failed — export before leaving');
        scheduleRetry();
        console.error('Sticky board save failed', error);
        throw error;
    });
    return writeQueue;
}

function durableCard(card) {
    const copy = structuredClone(card);
    delete copy.updatedAtDirty;
    return copy;
}

function durableBoard(board) {
    const copy = structuredClone(board);
    delete copy.updatedAtDirty;
    return copy;
}

async function persistDirtyBoard() {
    const board = currentBoard;
    if (!board?.updatedAtDirty) return;
    const revision = board.updatedAtDirty;
    board.viewport = normalizeViewport(viewport);
    board.updatedAt = Date.now();
    await queueWrite(() => saveBoard(durableBoard(board)));
    if (board.updatedAtDirty === revision) delete board.updatedAtDirty;
    refreshSaveStatus();
}

async function persistDirtyCards() {
    const pending = cards.filter((card) => card.updatedAtDirty).map((card) => {
        const revision = card.updatedAtDirty;
        card.updatedAt = Date.now();
        return { card, revision, snapshot: durableCard(card) };
    });
    if (!pending.length) return;
    await queueWrite(async () => {
        for (const item of pending) await saveCard(item.snapshot);
    });
    pending.forEach(({ card, revision }) => {
        if (card.updatedAtDirty === revision) delete card.updatedAtDirty;
    });
    refreshSaveStatus();
}

function scheduleCardSave() {
    window.clearTimeout(saveTimer);
    setStatus('Unsaved changes');
    saveTimer = window.setTimeout(() => {
        saveTimer = null;
        persistDirtyCards().catch(() => undefined);
    }, SAVE_DELAY);
}

function scheduleBoardSave() {
    if (!currentBoard) return;
    window.clearTimeout(boardTimer);
    currentBoard.updatedAtDirty = Number(currentBoard.updatedAtDirty ?? 0) + 1;
    setStatus('Unsaved changes');
    boardTimer = window.setTimeout(() => {
        boardTimer = null;
        persistDirtyBoard().catch(() => undefined);
    }, SAVE_DELAY);
}

async function flushSaves() {
    if (saveTimer) {
        window.clearTimeout(saveTimer);
        saveTimer = null;
    }
    if (cards.some((card) => card.updatedAtDirty)) await persistDirtyCards();
    if (boardTimer && currentBoard) {
        window.clearTimeout(boardTimer);
        boardTimer = null;
    }
    if (currentBoard?.updatedAtDirty) await persistDirtyBoard();
    await writeQueue;
}

function markCardChanged(card) {
    card.updatedAtDirty = Number(card.updatedAtDirty ?? 0) + 1;
    scheduleCardSave();
}

function applyViewport({ persist = false } = {}) {
    viewport = normalizeViewport(viewport);
    surface.style.transform = `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`;
    $('#zoom-reset').textContent = `${Math.round(viewport.zoom * 100)}%`;
    canvas.style.backgroundPosition = `${viewport.x}px ${viewport.y}px`;
    canvas.style.backgroundSize = `${24 * viewport.zoom}px ${24 * viewport.zoom}px`;
    if (persist) scheduleBoardSave();
}

function escapeHtml(value) {
    const span = document.createElement('span');
    span.textContent = value;
    return span.innerHTML;
}

function renderMarkdown(content) {
    const raw = window.marked.parse(content);
    const clean = window.DOMPurify.sanitize(raw, {
        USE_PROFILES: { html: true },
        FORBID_TAGS: ['img', 'video', 'audio', 'source', 'picture', 'iframe', 'object', 'embed', 'style', 'form', 'button'],
        FORBID_ATTR: ['style'],
    });
    const wrapper = document.createElement('div');
    wrapper.innerHTML = clean;
    wrapper.querySelectorAll('input').forEach((input) => {
        if (input.type !== 'checkbox' || !input.disabled) input.remove();
    });
    wrapper.querySelectorAll('[data-text-color]').forEach((element) => {
        const color = element.getAttribute('data-text-color');
        if (element.tagName !== 'SPAN' || !TEXT_COLORS.has(color)) element.removeAttribute('data-text-color');
    });
    wrapper.querySelectorAll('a').forEach((anchor) => {
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
    });
    return wrapper.innerHTML;
}

function renderCode(card) {
    const grammar = window.Prism.languages[card.language];
    const code = grammar
        ? window.Prism.highlight(card.content, grammar, card.language)
        : escapeHtml(card.content);
    return `<pre><code class="language-${escapeHtml(card.language)}">${code}</code></pre>`;
}

function legacyMarkdownToEditorHtml(content) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = renderMarkdown(String(content));
    wrapper.querySelectorAll('li > input[type="checkbox"]').forEach((checkbox) => {
        const item = checkbox.closest('li');
        const list = item?.parentElement;
        if (!item || list?.tagName !== 'UL') return;
        list.dataset.type = 'taskList';
        item.dataset.type = 'taskItem';
        item.dataset.checked = String(checkbox.checked);
        checkbox.remove();
    });
    return wrapper.innerHTML;
}

function cardPlainText(card) {
    if (card.type === 'code' || card.contentFormat === 'markdown') return String(card.content);
    return richTextToPlainText(card.content);
}

function entityPlainText(entity) {
    if (entity.type === 'shape' || entity.type === 'connector') return entity.label;
    return `${entity.title}\n${cardPlainText(entity)}\n${entity.language ?? ''}`;
}

function updateCodePreview(card, element) {
    if (card.type !== 'code') return;
    $('.card-preview', element).innerHTML = renderCode(card);
}

function setCodeEditing(element, editing) {
    if (element.dataset.type !== 'code') {
        noteEditors.get(element.dataset.id)?.focus();
        return;
    }
    element.classList.toggle('is-editing', editing);
    if (editing) {
        const editor = $('.card-editor', element);
        editor.focus();
        editor.setSelectionRange(editor.value.length, editor.value.length);
    }
}

function refreshEditorToolbar(element, editor) {
    const states = {
        bold: editor.isActive('bold'),
        italic: editor.isActive('italic'),
        strike: editor.isActive('strike'),
        code: editor.isActive('code'),
        'bullet-list': editor.isActive('bulletList'),
        'ordered-list': editor.isActive('orderedList'),
        'task-list': editor.isActive('taskList'),
    };
    Object.entries(states).forEach(([action, active]) => {
        const button = element.querySelector(`[data-editor-action="${action}"]`);
        if (button) button.setAttribute('aria-pressed', String(active));
    });
    const blockStyle = $('.block-style', element);
    blockStyle.value = editor.isActive('heading', { level: 2 }) ? 'heading' : 'paragraph';
}

function updateCardElement(card, element) {
    element.dataset.id = card.id;
    element.dataset.type = card.type;
    element.dataset.color = card.color;
    element.style.left = `${card.x}px`;
    element.style.top = `${card.y}px`;
    element.style.width = `${card.width}px`;
    element.style.height = `${card.height}px`;
    element.style.zIndex = String(card.z);
    element.setAttribute('aria-label', `${card.type === 'code' ? 'Code' : 'Note'} card: ${card.title}`);
    $('.card-kind', element).textContent = card.type === 'code' ? 'code' : 'note';
    $('.card-title', element).value = card.title;
    $('.card-editor', element).value = card.type === 'code' ? card.content : '';
    $('.card-language', element).value = card.language ?? 'javascript';
    $('.card-color', element).value = card.color;
    updateCodePreview(card, element);
}

function findCard(id) {
    return cards.find((card) => card.id === id);
}

function resizeShapeLabel(shape, element) {
    if (shape.shape === 'text') return;
    const label = $('.shape-label', element);
    label.style.height = 'auto';
    const contentHeight = Math.max(42, label.scrollHeight);
    label.style.height = `${Math.min(Math.max(42, shape.height - 24), contentHeight)}px`;
}

function updateShapeElement(shape, element) {
    element.dataset.id = shape.id;
    element.dataset.type = 'shape';
    element.dataset.shape = shape.shape;
    element.dataset.fill = shape.fill;
    element.dataset.stroke = shape.stroke;
    element.dataset.strokeStyle = shape.strokeStyle;
    element.style.left = `${shape.x}px`;
    element.style.top = `${shape.y}px`;
    element.style.width = `${shape.width}px`;
    element.style.height = `${shape.height}px`;
    element.style.zIndex = String(shape.z);
    element.setAttribute('aria-label', `${shape.shape} shape: ${shape.label || 'Unlabeled'}`);
    $('.shape-label', element).value = shape.label;
    $('.shape-fill', element).value = shape.fill;
    $('.shape-stroke', element).value = shape.stroke === 'transparent' ? 'ink' : shape.stroke;
    $('.shape-stroke-style', element).value = shape.strokeStyle;
}

function selectConnector(id) {
    selectedConnectorId = id;
    if (id) {
        const activeObject = document.activeElement?.closest?.('.canvas-card, .canvas-shape');
        activeObject?.blur();
        surface.querySelectorAll('.canvas-card.is-selected, .canvas-shape.is-selected').forEach((element) => element.classList.remove('is-selected'));
    }
    connectorLayer.querySelectorAll('.canvas-connector').forEach((element) => {
        element.classList.toggle('is-selected', element.dataset.id === id);
    });
    const connector = findCard(id);
    connectorToolbar.hidden = !connector;
    if (!connector) return;
    $('#connector-label').value = connector.label;
    $('#connector-stroke').value = connector.stroke;
    $('#connector-style').value = connector.strokeStyle;
    $('#connector-arrow-style').value = connector.arrow;
}

function renderConnectors() {
    connectorLayer.querySelectorAll('.canvas-connector').forEach((element) => element.remove());
    const entities = new Map(cards.map((entity) => [entity.id, entity]));
    cards.filter((entity) => entity.type === 'connector').sort((a, b) => a.z - b.z).forEach((connector) => {
        const geometry = resolveConnectorGeometry(connector, entities);
        if (!geometry) return;
        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        group.classList.add('canvas-connector');
        group.dataset.id = connector.id;
        group.dataset.stroke = connector.stroke;
        group.dataset.strokeStyle = connector.strokeStyle;
        group.setAttribute('tabindex', '0');
        group.setAttribute('role', 'button');
        group.setAttribute('aria-label', connector.label ? `Connector: ${connector.label}` : 'Connector');
        const pathData = `M ${geometry.x1} ${geometry.y1} L ${geometry.x2} ${geometry.y2}`;
        const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        hit.classList.add('connector-hit');
        hit.setAttribute('d', pathData);
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        line.classList.add('connector-line');
        line.setAttribute('d', pathData);
        if (connector.arrow === 'end') line.setAttribute('marker-end', 'url(#connector-arrow)');
        group.append(hit, line);
        if (connector.label) {
            const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            label.classList.add('connector-text');
            label.setAttribute('x', String((geometry.x1 + geometry.x2) / 2));
            label.setAttribute('y', String((geometry.y1 + geometry.y2) / 2 - 9));
            label.setAttribute('text-anchor', 'middle');
            label.textContent = connector.label;
            group.append(label);
        }
        group.addEventListener('pointerdown', (event) => {
            event.preventDefault();
            event.stopPropagation();
            selectConnector(connector.id);
        });
        group.addEventListener('keydown', (event) => {
            if (['Enter', ' '].includes(event.key)) {
                event.preventDefault();
                selectConnector(connector.id);
                return;
            }
            if (!['Delete', 'Backspace'].includes(event.key)) return;
            event.preventDefault();
            deleteCanvasEntity(connector, { confirm: false });
        });
        if (connector.id === selectedConnectorId) group.classList.add('is-selected');
        connectorLayer.append(group);
    });
    if (selectedConnectorId && !findCard(selectedConnectorId)) selectConnector(null);
}

function appendShapeElement(shape) {
    const element = shapeTemplate.content.firstElementChild.cloneNode(true);
    updateShapeElement(shape, element);
    surface.append(element);
    bindShape(shape, element);
    return element;
}

function renderShapes() {
    cards.filter((entity) => entity.type === 'shape').forEach(appendShapeElement);
}

function appendCanvasEntity(entity) {
    if (entity.type === 'shape') return appendShapeElement(entity);
    const element = cardTemplate.content.firstElementChild.cloneNode(true);
    updateCardElement(entity, element);
    surface.append(element);
    bindCard(entity, element);
    return element;
}

function nextZIndex() {
    if (topZ >= 999_999) {
        topZ = renormalizeZOrder(cards);
        cards.forEach((item) => {
            item.updatedAtDirty = Number(item.updatedAtDirty ?? 0) + 1;
            const itemElement = surface.querySelector(`[data-id="${CSS.escape(item.id)}"]`);
            if (itemElement) itemElement.style.zIndex = String(item.z);
        });
        if (cards.length) scheduleCardSave();
    }
    topZ += 1;
    return topZ;
}

function bringToFront(card, element) {
    card.z = nextZIndex();
    element.style.zIndex = String(card.z);
    markCardChanged(card);
}

function startCardPointer(event, card, element, mode) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    bringToFront(card, element);
    const start = { x: event.clientX, y: event.clientY, cardX: card.x, cardY: card.y, width: card.width, height: card.height };
    interaction = { mode, pointerId: event.pointerId, card, element, start };
    canvas.setPointerCapture(event.pointerId);
}

function setActiveTool(tool) {
    activeTool = tool;
    connectorStartId = null;
    canvas.classList.toggle('is-connecting', tool === 'connector');
    $('#add-connector').setAttribute('aria-pressed', String(tool === 'connector'));
    surface.querySelectorAll('.is-connector-source').forEach((element) => element.classList.remove('is-connector-source'));
    if (tool === 'connector') setStatus('Connector: select the first object');
    else refreshSaveStatus();
}

async function handleConnectorTarget(entity, element) {
    if (entity.type === 'connector') return;
    if (!connectorStartId) {
        connectorStartId = entity.id;
        element.classList.add('is-connector-source');
        setStatus('Connector: select the second object');
        return;
    }
    if (connectorStartId === entity.id) {
        setStatus('Connector needs a different second object');
        return;
    }
    const source = findCard(connectorStartId);
    if (!source) {
        setActiveTool('select');
        return;
    }
    const anchors = chooseConnectorAnchors(source, entity);
    const connector = createConnector({
        id: uuid(),
        boardId: currentBoard.id,
        from: { entityId: source.id, anchor: anchors.from },
        to: { entityId: entity.id, anchor: anchors.to },
        z: nextZIndex(),
    });
    await queueWrite(() => saveCard(connector));
    cards.push(connector);
    setActiveTool('select');
    renderConnectors();
    selectConnector(connector.id);
}

function handleConnectorActivationKey(event, entity, element) {
    if (activeTool !== 'connector' || event.target !== element || !['Enter', ' '].includes(event.key)) return false;
    event.preventDefault();
    handleConnectorTarget(entity, element).catch((error) => console.error('Could not create connector', error));
    return true;
}

async function deleteCanvasEntity(entity, { confirm = true } = {}) {
    if (!canUseDurableNotes()) return false;
    const name = entity.title || entity.label || (entity.type === 'connector' ? 'connector' : 'object');
    if (confirm && !window.confirm(`Delete “${name}”?`)) return false;
    const ids = collectDeletionIds(entity.id, cards);
    try {
        await flushSaves();
        await queueWrite(() => deleteCards(ids));
    } catch {
        return false;
    }
    ids.forEach((id) => {
        noteEditors.get(id)?.destroy();
        noteEditors.delete(id);
        unsavableNoteIds.delete(id);
        surface.querySelector(`[data-id="${CSS.escape(id)}"]`)?.remove();
        connectorLayer.querySelector(`[data-id="${CSS.escape(id)}"]`)?.remove();
    });
    cards = cards.filter((item) => !ids.includes(item.id));
    if (ids.includes(selectedConnectorId)) selectedConnectorId = null;
    renderConnectors();
    filterCards();
    return true;
}

async function duplicateCanvasEntity(entity) {
    if (!canUseDurableNotes()) return false;
    const duplicate = entity.type === 'shape'
        ? createShape({ ...entity, id: uuid(), x: entity.x + 32, y: entity.y + 32, z: nextZIndex(), now: Date.now() })
        : createCard({ ...entity, id: uuid(), x: entity.x + 32, y: entity.y + 32, z: nextZIndex(), now: Date.now() });
    await queueWrite(() => saveCard(duplicate));
    cards.push(duplicate);
    const element = appendCanvasEntity(duplicate);
    filterCards();
    element.focus();
    return true;
}

function changeEntityLayer(entity, direction) {
    const ordered = cards.filter((item) => item.type !== 'connector').sort((a, b) => a.z - b.z || a.createdAt - b.createdAt);
    const index = ordered.findIndex((item) => item.id === entity.id);
    const target = ordered[index + direction];
    if (!target) return;
    [entity.z, target.z] = [target.z, entity.z];
    for (const item of [entity, target]) {
        const element = surface.querySelector(`[data-id="${CSS.escape(item.id)}"]`);
        if (element) element.style.zIndex = String(item.z);
        markCardChanged(item);
    }
}

function positionNoteToolbar(element, toolbar) {
    if (!toolbar || !element.classList.contains('is-selected')) return;
    toolbar.style.left = '0px';
    toolbar.style.top = '';
    toolbar.style.bottom = '';
    let bounds = toolbar.getBoundingClientRect();
    const cardBounds = element.getBoundingClientRect();
    const canvasBounds = canvas.getBoundingClientRect();
    const quickBounds = $('.quick-create').getBoundingClientRect();
    const margin = 10;
    let viewportDelta = 0;
    if (bounds.left < margin) viewportDelta = margin - bounds.left;
    else if (bounds.right > window.innerWidth - margin) viewportDelta = window.innerWidth - margin - bounds.right;
    toolbar.style.left = `${viewportDelta / viewport.zoom}px`;
    bounds = toolbar.getBoundingClientRect();
    const minimumTop = Math.max(canvasBounds.top + margin, quickBounds.bottom + 8);
    const maximumTop = Math.max(minimumTop, window.innerHeight - margin - bounds.height);
    if (bounds.top < minimumTop || bounds.bottom > window.innerHeight - margin) {
        const desiredTop = Math.min(maximumTop, Math.max(minimumTop, bounds.top));
        toolbar.style.top = `${(desiredTop - cardBounds.top) / viewport.zoom}px`;
        toolbar.style.bottom = 'auto';
    }
}

function bindCard(card, element) {
    const header = $('.card-header', element);
    const codeEditor = $('.card-editor', element);
    const formatToolbar = $('.note-format-toolbar', element);
    const resizeControl = $('.card-resize', element);
    let richEditor = null;

    element.addEventListener('pointerdown', (event) => {
        if (activeTool !== 'connector') {
            selectConnector(null);
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        handleConnectorTarget(card, element).catch((error) => console.error('Could not create connector', error));
    }, { capture: true });

    header.addEventListener('pointerdown', (event) => {
        if (event.target.closest('button, input, select, summary, details')) return;
        startCardPointer(event, card, element, 'drag-card');
    });
    resizeControl.addEventListener('pointerdown', (event) => startCardPointer(event, card, element, 'resize-card'));
    resizeControl.addEventListener('keydown', (event) => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
        event.preventDefault();
        const step = event.shiftKey ? 40 : 10;
        if (event.key === 'ArrowLeft') card.width = Math.max(240, card.width - step);
        if (event.key === 'ArrowRight') card.width = Math.min(1_200, card.width + step);
        if (event.key === 'ArrowUp') card.height = Math.max(170, card.height - step);
        if (event.key === 'ArrowDown') card.height = Math.min(1_000, card.height + step);
        element.style.width = `${card.width}px`;
        element.style.height = `${card.height}px`;
        markCardChanged(card);
    });
    $('.card-preview', element).addEventListener('dblclick', () => setCodeEditing(element, true));
    $('.card-edit', element).addEventListener('click', () => setCodeEditing(element, true));
    $('.card-done', element).addEventListener('click', () => setCodeEditing(element, false));

    if (card.type === 'note') {
        const initialContent = card.contentFormat === 'tiptap-json'
            ? card.content
            : legacyMarkdownToEditorHtml(card.content);
        const refreshToolbar = () => {
            if (richEditor) refreshEditorToolbar(element, richEditor);
        };
        richEditor = createNoteEditor({
            element: $('.note-editor', element),
            content: initialContent,
            onUpdate: (document) => {
                if (JSON.stringify(document).length > 200_000) {
                    unsavableNoteIds.add(card.id);
                    refreshSaveStatus();
                    return;
                }
                unsavableNoteIds.delete(card.id);
                if (card.contentFormat === 'markdown' && typeof card.legacyMarkdown !== 'string') card.legacyMarkdown = String(card.content);
                card.content = document;
                card.contentFormat = 'tiptap-json';
                markCardChanged(card);
            },
            onFocus: () => {
                if (!element.classList.contains('is-selected')) bringToFront(card, element);
                element.classList.add('is-selected');
                window.requestAnimationFrame(() => positionNoteToolbar(element, formatToolbar));
            },
            onBlur: () => window.setTimeout(() => {
                if (!element.matches(':focus-within')) element.classList.remove('is-selected');
            }),
            onStateChange: refreshToolbar,
        });
        noteEditors.set(card.id, richEditor);
        refreshToolbar();

        formatToolbar.addEventListener('pointerdown', (event) => {
            if (event.target.closest('button')) event.preventDefault();
        });
        formatToolbar.querySelectorAll('[data-editor-action]').forEach((button) => {
            button.addEventListener('click', () => {
                richEditor.run(button.dataset.editorAction);
                refreshToolbar();
            });
        });
        $('.block-style', element).addEventListener('change', (event) => {
            richEditor.run(event.target.value);
            refreshToolbar();
        });
        $('.text-size', element).addEventListener('change', (event) => {
            richEditor.run('font-size', event.target.value);
            event.target.value = '';
        });
        $('.text-color', element).addEventListener('change', (event) => {
            richEditor.run('text-color', event.target.value);
            event.target.value = '';
        });
    }

    $('.card-title', element).addEventListener('input', (event) => {
        card.title = event.target.value.trimStart().slice(0, 80) || (card.type === 'code' ? 'Code snippet' : 'Sticky note');
        element.setAttribute('aria-label', `${card.type === 'code' ? 'Code' : 'Note'} card: ${card.title}`);
        markCardChanged(card);
    });
    codeEditor.addEventListener('input', (event) => {
        if (card.type !== 'code') return;
        card.content = event.target.value.slice(0, 200_000);
        updateCodePreview(card, element);
        markCardChanged(card);
    });
    $('.card-language', element).addEventListener('change', (event) => {
        if (card.type !== 'code') return;
        card.language = event.target.value;
        updateCodePreview(card, element);
        markCardChanged(card);
    });
    $('.card-color', element).addEventListener('change', (event) => {
        card.color = event.target.value;
        element.dataset.color = card.color;
        markCardChanged(card);
    });
    $('.card-copy', element).addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(cardPlainText(card));
            setStatus('Copied card content');
            window.setTimeout(refreshSaveStatus, 1_200);
        } catch {
            setStatus('Copy failed');
        }
    });
    $('.card-duplicate', element).addEventListener('click', () => {
        duplicateCanvasEntity(card).catch((error) => console.error('Could not duplicate card', error));
    });
    $('.card-send-back', element).addEventListener('click', () => changeEntityLayer(card, -1));
    $('.card-bring-front', element).addEventListener('click', () => changeEntityLayer(card, 1));
    $('.card-delete', element).addEventListener('click', () => {
        deleteCanvasEntity(card).catch((error) => console.error('Could not delete object', error));
    });
    element.addEventListener('keydown', (event) => {
        if (handleConnectorActivationKey(event, card, element)) return;
        if (event.key === 'Escape') {
            if (card.type === 'code') setCodeEditing(element, false);
            else document.activeElement?.blur();
            return;
        }
        if (event.target.closest('input, textarea, select, button, [contenteditable="true"]')) return;
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
        event.preventDefault();
        const step = event.shiftKey ? 40 : 10;
        if (event.key === 'ArrowLeft') card.x -= step;
        if (event.key === 'ArrowRight') card.x += step;
        if (event.key === 'ArrowUp') card.y -= step;
        if (event.key === 'ArrowDown') card.y += step;
        element.style.left = `${card.x}px`;
        element.style.top = `${card.y}px`;
        renderConnectors();
        markCardChanged(card);
    });
}

function bindShape(shape, element) {
    const frame = $('.shape-frame', element);
    const resizeControl = $('.shape-resize', element);
    const label = $('.shape-label', element);
    resizeShapeLabel(shape, element);

    element.addEventListener('pointerdown', (event) => {
        if (activeTool !== 'connector') {
            selectConnector(null);
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        handleConnectorTarget(shape, element).catch((error) => console.error('Could not create connector', error));
    }, { capture: true });
    frame.addEventListener('pointerdown', (event) => {
        if (event.target.closest('textarea, button, input, select')) return;
        startCardPointer(event, shape, element, 'drag-card');
    });
    $('.shape-drag', element).addEventListener('pointerdown', (event) => startCardPointer(event, shape, element, 'drag-card'));
    element.addEventListener('focusin', () => element.classList.add('is-selected'));
    element.addEventListener('focusout', () => window.setTimeout(() => {
        if (!element.matches(':focus-within')) element.classList.remove('is-selected');
    }));
    label.addEventListener('input', (event) => {
        shape.label = event.target.value.slice(0, 500);
        element.setAttribute('aria-label', `${shape.shape} shape: ${shape.label || 'Unlabeled'}`);
        resizeShapeLabel(shape, element);
        markCardChanged(shape);
    });
    $('.shape-fill', element).addEventListener('change', (event) => {
        shape.fill = event.target.value;
        element.dataset.fill = shape.fill;
        markCardChanged(shape);
    });
    $('.shape-stroke', element).addEventListener('change', (event) => {
        shape.stroke = event.target.value;
        element.dataset.stroke = shape.stroke;
        markCardChanged(shape);
    });
    $('.shape-stroke-style', element).addEventListener('change', (event) => {
        shape.strokeStyle = event.target.value;
        element.dataset.strokeStyle = shape.strokeStyle;
        markCardChanged(shape);
    });
    $('.shape-send-back', element).addEventListener('click', () => changeEntityLayer(shape, -1));
    $('.shape-bring-front', element).addEventListener('click', () => changeEntityLayer(shape, 1));
    $('.shape-duplicate', element).addEventListener('click', () => {
        duplicateCanvasEntity(shape).catch((error) => console.error('Could not duplicate shape', error));
    });
    $('.shape-delete', element).addEventListener('click', () => {
        deleteCanvasEntity(shape).catch((error) => console.error('Could not delete shape', error));
    });
    resizeControl.addEventListener('pointerdown', (event) => startCardPointer(event, shape, element, 'resize-shape'));
    resizeControl.addEventListener('keydown', (event) => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
        event.preventDefault();
        const step = event.shiftKey ? 40 : 10;
        if (event.key === 'ArrowLeft') shape.width = Math.max(SHAPE_GEOMETRY.minWidth, shape.width - step);
        if (event.key === 'ArrowRight') shape.width = Math.min(SHAPE_GEOMETRY.maxWidth, shape.width + step);
        if (event.key === 'ArrowUp') shape.height = Math.max(SHAPE_GEOMETRY.minHeight, shape.height - step);
        if (event.key === 'ArrowDown') shape.height = Math.min(SHAPE_GEOMETRY.maxHeight, shape.height + step);
        element.style.width = `${shape.width}px`;
        element.style.height = `${shape.height}px`;
        resizeShapeLabel(shape, element);
        renderConnectors();
        markCardChanged(shape);
    });
    element.addEventListener('keydown', (event) => {
        if (handleConnectorActivationKey(event, shape, element)) return;
        if (event.target.closest('textarea, input, select, button')) return;
        if (['Delete', 'Backspace'].includes(event.key)) {
            event.preventDefault();
            deleteCanvasEntity(shape).catch((error) => console.error('Could not delete shape', error));
            return;
        }
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
        event.preventDefault();
        const step = event.shiftKey ? 40 : 10;
        if (event.key === 'ArrowLeft') shape.x -= step;
        if (event.key === 'ArrowRight') shape.x += step;
        if (event.key === 'ArrowUp') shape.y -= step;
        if (event.key === 'ArrowDown') shape.y += step;
        element.style.left = `${shape.x}px`;
        element.style.top = `${shape.y}px`;
        renderConnectors();
        markCardChanged(shape);
    });
}

function renderCards() {
    noteEditors.forEach((editor) => editor.destroy());
    noteEditors.clear();
    surface.replaceChildren(connectorLayer);
    topZ = Math.max(1, ...cards.map((card) => card.z));
    cards.filter((card) => ['note', 'code'].includes(card.type)).forEach(appendCanvasEntity);
    renderShapes();
    renderConnectors();
    filterCards();
}

function renderBoardOptions() {
    boardSelect.replaceChildren(...boards.map((board) => {
        const option = document.createElement('option');
        option.value = board.id;
        option.textContent = board.name;
        option.selected = board.id === currentBoard?.id;
        return option;
    }));
}

function setBoardControlsDisabled(disabled) {
    boardBusyDepth = Math.max(0, boardBusyDepth + (disabled ? 1 : -1));
    const busy = boardBusyDepth > 0;
    [boardSelect, $('#new-board'), $('#rename-board'), $('#delete-board')]
        .forEach((control) => { control.disabled = busy; });
    $('.sticky-header').inert = busy;
    canvas.inert = busy;
    canvas.setAttribute('aria-busy', String(busy));
}

async function openBoard(board) {
    if (currentBoard && board.id !== currentBoard.id && !canUseDurableNotes()) {
        boardSelect.value = currentBoard.id;
        return;
    }
    setBoardControlsDisabled(true);
    try {
        await flushSaves();
        currentBoard = board;
        const storedCards = await listCards(board.id);
        cards = storedCards.map(migrateCard);
        if (cards.some((card, index) => card !== storedCards[index])) {
            await queueWrite(async () => {
                for (const card of cards) await saveCard(durableCard(card));
            });
        }
        viewport = normalizeViewport(board.viewport);
        await setSetting('current-board-id', board.id);
        renderBoardOptions();
        renderCards();
        applyViewport();
        const shouldFitMobile = window.matchMedia('(max-width: 620px)').matches
            && cards.some((entity) => entity.type !== 'connector')
            && !hasVisibleCanvasEntity(cards, viewport, { width: canvas.clientWidth, height: canvas.clientHeight });
        if (shouldFitMobile) fitCards();
        else setStatus('Saved locally');
    } finally {
        setBoardControlsDisabled(false);
    }
}

function canvasCenterWorld() {
    const rect = canvas.getBoundingClientRect();
    return {
        x: (rect.width / 2 - viewport.x) / viewport.zoom,
        y: (rect.height / 2 - viewport.y) / viewport.zoom,
    };
}

async function addCard(type) {
    if (!canUseDurableNotes()) return;
    const center = canvasCenterWorld();
    const offset = (cards.length % 8) * 28;
    const card = createCard({
        id: uuid(),
        boardId: currentBoard.id,
        type,
        x: center.x - (type === 'code' ? 210 : 150) + offset,
        y: center.y - 120 + offset,
        z: nextZIndex(),
    });
    await queueWrite(() => saveCard(card));
    cards.push(card);
    const element = appendCanvasEntity(card);
    filterCards();
    if (type === 'note') noteEditors.get(card.id)?.focus();
    else setCodeEditing(element, true);
}

async function addShape(shapeKind) {
    if (!canUseDurableNotes()) return;
    const center = canvasCenterWorld();
    const objectCount = cards.filter((entity) => entity.type !== 'connector').length;
    const placementOffsets = [[0, 0], [280, 0], [-280, 0], [0, 190], [280, 190], [-280, 190], [0, -190], [280, -190], [-280, -190]];
    const [offsetX, offsetY] = placementOffsets[objectCount % placementOffsets.length];
    const sizes = {
        rectangle: [220, 120], rounded: [220, 120], ellipse: [220, 120], diamond: [180, 140], text: [240, 80],
    };
    const [width, height] = sizes[shapeKind];
    const shape = createShape({
        id: uuid(),
        boardId: currentBoard.id,
        shape: shapeKind,
        x: center.x - width / 2 + offsetX,
        y: center.y - height / 2 + offsetY,
        width,
        height,
        z: nextZIndex(),
    });
    await queueWrite(() => saveCard(shape));
    cards.push(shape);
    const element = appendCanvasEntity(shape);
    filterCards();
    element.focus();
    if (shapeKind === 'text') {
        const label = $('.shape-label', element);
        label?.focus();
        label?.select();
    }
}

function filterCards() {
    const query = searchInput.value.trim().toLowerCase();
    cards.forEach((entity) => {
        const matches = !query || entityPlainText(entity).toLowerCase().includes(query);
        const element = entity.type === 'connector'
            ? connectorLayer.querySelector(`[data-id="${CSS.escape(entity.id)}"]`)
            : surface.querySelector(`[data-id="${CSS.escape(entity.id)}"]`);
        element?.classList.toggle('is-search-hidden', !matches);
    });
}

function zoomAt(nextZoom, screenX, screenY, persist = true) {
    const oldZoom = viewport.zoom;
    const zoom = Math.min(2.5, Math.max(.25, nextZoom));
    const worldX = (screenX - viewport.x) / oldZoom;
    const worldY = (screenY - viewport.y) / oldZoom;
    viewport.x = screenX - worldX * zoom;
    viewport.y = screenY - worldY * zoom;
    viewport.zoom = zoom;
    applyViewport({ persist });
}

function fitCards() {
    const objects = cards.filter((entity) => entity.type !== 'connector');
    if (!objects.length) {
        viewport = { x: 0, y: 0, zoom: 1 };
        applyViewport({ persist: true });
        return;
    }
    const bounds = objects.reduce((result, card) => ({
        left: Math.min(result.left, card.x),
        top: Math.min(result.top, card.y),
        right: Math.max(result.right, card.x + card.width),
        bottom: Math.max(result.bottom, card.y + card.height),
    }), { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
    const rect = canvas.getBoundingClientRect();
    const padding = 70;
    const zoom = Math.min(1.5, Math.max(.25, Math.min(
        (rect.width - padding * 2) / Math.max(1, bounds.right - bounds.left),
        (rect.height - padding * 2) / Math.max(1, bounds.bottom - bounds.top),
    )));
    viewport = {
        zoom,
        x: (rect.width - (bounds.right - bounds.left) * zoom) / 2 - bounds.left * zoom,
        y: (rect.height - (bounds.bottom - bounds.top) * zoom) / 2 - bounds.top * zoom,
    };
    applyViewport({ persist: true });
}

canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || event.target !== canvas) return;
    selectConnector(null);
    event.preventDefault();
    interaction = {
        mode: 'pan', pointerId: event.pointerId,
        start: { x: event.clientX, y: event.clientY, viewportX: viewport.x, viewportY: viewport.y },
    };
    canvas.classList.add('is-panning');
    canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener('pointermove', (event) => {
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    const dx = event.clientX - interaction.start.x;
    const dy = event.clientY - interaction.start.y;
    if (interaction.mode === 'pan') {
        viewport.x = interaction.start.viewportX + dx;
        viewport.y = interaction.start.viewportY + dy;
        applyViewport();
    } else if (interaction.mode === 'drag-card') {
        const { card, element, start } = interaction;
        card.x = start.cardX + dx / viewport.zoom;
        card.y = start.cardY + dy / viewport.zoom;
        element.style.left = `${card.x}px`;
        element.style.top = `${card.y}px`;
        renderConnectors();
        card.updatedAtDirty = true;
        setStatus('Unsaved changes');
    } else if (interaction.mode === 'resize-card') {
        const { card, element, start } = interaction;
        card.width = Math.min(1_200, Math.max(240, start.width + dx / viewport.zoom));
        card.height = Math.min(1_000, Math.max(170, start.height + dy / viewport.zoom));
        element.style.width = `${card.width}px`;
        element.style.height = `${card.height}px`;
        renderConnectors();
        card.updatedAtDirty = true;
        setStatus('Unsaved changes');
    } else if (interaction.mode === 'resize-shape') {
        const { card, element, start } = interaction;
        card.width = Math.min(SHAPE_GEOMETRY.maxWidth, Math.max(SHAPE_GEOMETRY.minWidth, start.width + dx / viewport.zoom));
        card.height = Math.min(SHAPE_GEOMETRY.maxHeight, Math.max(SHAPE_GEOMETRY.minHeight, start.height + dy / viewport.zoom));
        element.style.width = `${card.width}px`;
        element.style.height = `${card.height}px`;
        resizeShapeLabel(card, element);
        renderConnectors();
        card.updatedAtDirty = true;
        setStatus('Unsaved changes');
    }
});

function finishPointer(event) {
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    if (interaction.mode === 'pan') scheduleBoardSave();
    if (interaction.card) markCardChanged(interaction.card);
    interaction = null;
    canvas.classList.remove('is-panning');
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
}
canvas.addEventListener('pointerup', finishPointer);
canvas.addEventListener('pointercancel', finishPointer);
canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    if (event.ctrlKey || event.metaKey) {
        const factor = Math.exp(-event.deltaY * .002);
        zoomAt(viewport.zoom * factor, event.clientX - rect.left, event.clientY - rect.top);
    } else {
        viewport.x -= event.deltaX;
        viewport.y -= event.deltaY;
        applyViewport({ persist: true });
    }
}, { passive: false });

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && activeTool === 'connector') {
        setActiveTool('select');
        return;
    }
    if (event.target.closest('input, textarea, select, [contenteditable="true"]') || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key.toLowerCase() === 'n') addCard('note');
    if (event.key.toLowerCase() === 'c') addCard('code');
    if (event.key === '0') fitCards();
});

$('#add-note').addEventListener('click', () => addCard('note'));
$('#add-code').addEventListener('click', () => addCard('code'));
for (const shapeKind of ['rectangle', 'rounded', 'ellipse', 'diamond', 'text']) {
    $(`#add-${shapeKind}`).addEventListener('click', () => {
        $('.insert-menu').open = false;
        addShape(shapeKind).catch((error) => console.error('Could not add shape', error));
    });
}
$('#add-connector').addEventListener('click', () => {
    $('.insert-menu').open = false;
    setActiveTool(activeTool === 'connector' ? 'select' : 'connector');
});
for (const [selector, field] of [
    ['#connector-label', 'label'],
    ['#connector-stroke', 'stroke'],
    ['#connector-style', 'strokeStyle'],
    ['#connector-arrow-style', 'arrow'],
]) {
    $(selector).addEventListener(selector === '#connector-label' ? 'input' : 'change', (event) => {
        const connector = findCard(selectedConnectorId);
        if (!connector) return;
        connector[field] = event.target.value;
        markCardChanged(connector);
        renderConnectors();
        selectConnector(connector.id);
    });
}
$('#delete-connector').addEventListener('click', () => {
    const connector = findCard(selectedConnectorId);
    if (connector) deleteCanvasEntity(connector, { confirm: false }).catch((error) => console.error('Could not delete connector', error));
});
searchInput.addEventListener('input', filterCards);
$('#zoom-in').addEventListener('click', () => zoomAt(viewport.zoom * 1.2, canvas.clientWidth / 2, canvas.clientHeight / 2));
$('#zoom-out').addEventListener('click', () => zoomAt(viewport.zoom / 1.2, canvas.clientWidth / 2, canvas.clientHeight / 2));
$('#zoom-reset').addEventListener('click', () => zoomAt(1, canvas.clientWidth / 2, canvas.clientHeight / 2));
$('#fit-cards').addEventListener('click', fitCards);

boardSelect.addEventListener('change', () => {
    const board = boards.find((item) => item.id === boardSelect.value);
    if (board) openBoard(board).catch((error) => console.error('Could not open board', error));
});
$('#new-board').addEventListener('click', async () => {
    if (!canUseDurableNotes()) return;
    const name = window.prompt('Board name', 'Untitled board');
    if (name === null) return;
    setBoardControlsDisabled(true);
    try {
        const board = createBoard({ id: uuid(), name });
        await queueWrite(() => saveBoard(board));
        boards.unshift(board);
        await openBoard(board);
    } finally {
        setBoardControlsDisabled(false);
    }
});
$('#rename-board').addEventListener('click', async () => {
    const name = window.prompt('Rename board', currentBoard.name);
    if (name === null) return;
    setBoardControlsDisabled(true);
    try {
        const renamed = createBoard({ id: currentBoard.id, name, now: currentBoard.createdAt, viewport });
        renamed.updatedAt = Date.now();
        currentBoard = renamed;
        boards = boards.map((board) => board.id === renamed.id ? renamed : board);
        renderBoardOptions();
        currentBoard.updatedAtDirty = 1;
        await persistDirtyBoard();
    } finally {
        setBoardControlsDisabled(false);
    }
});
$('#delete-board').addEventListener('click', async () => {
    if (!canUseDurableNotes()) return;
    if (boards.length === 1) {
        window.alert('Keep at least one board. Create another board before deleting this one.');
        return;
    }
    if (!window.confirm(`Delete “${currentBoard.name}” and all of its cards?`)) return;
    setBoardControlsDisabled(true);
    try {
        await flushSaves();
        const id = currentBoard.id;
        await queueWrite(() => deleteBoard(id));
        boards = boards.filter((board) => board.id !== id);
        await openBoard(boards[0]);
    } finally {
        setBoardControlsDisabled(false);
    }
});

$('#persist-storage').addEventListener('click', async () => {
    if (!navigator.storage?.persist) {
        setStatus('Persistent storage is unavailable in this browser');
        return;
    }
    const persistent = await navigator.storage.persist();
    setStatus(persistent ? 'Local storage is protected' : 'Browser did not grant protected storage');
});

$('#export-workspace').addEventListener('click', async () => {
    if (!canUseDurableNotes()) return;
    await flushSaves();
    const workspace = await exportWorkspace();
    const backup = {
        type: BACKUP_TYPE,
        schemaVersion: SCHEMA_VERSION,
        exportedAt: Date.now(),
        currentBoardId: workspace.currentBoardId ?? currentBoard.id,
        boards: workspace.boards,
        cards: workspace.cards,
    };
    validateWorkspaceBackup(backup);
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `sticky-board-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setStatus('Workspace backup exported');
});

$('#import-workspace-input').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!canUseDurableNotes()) return;
    if (file.size > 25 * 1024 * 1024) {
        setStatus('Backup is too large');
        return;
    }
    let backup;
    try {
        backup = validateWorkspaceBackup(JSON.parse(await file.text()));
    } catch (error) {
        console.error('Sticky-board backup validation failed', error);
        setStatus('Invalid backup — nothing was replaced');
        return;
    }
    if (!window.confirm('Replace every local sticky board with this backup? Export first if needed.')) return;
    let workspaceReplaced = false;
    try {
        await flushSaves();
        await replaceWorkspace(backup);
        workspaceReplaced = true;
        boards = backup.boards.sort((a, b) => b.updatedAt - a.updatedAt);
        await openBoard(boards.find((board) => board.id === backup.currentBoardId) ?? boards[0]);
        setStatus('Workspace backup restored');
    } catch (error) {
        console.error('Sticky-board import failed', error);
        if (workspaceReplaced) setStatus('Backup was restored, but the board could not be opened');
        else if (hasDirtyChanges()) setStatus('Local save failed — export before leaving');
        else setStatus('Backup could not be restored — nothing was replaced');
    }
});

window.addEventListener('resize', () => {
    document.querySelectorAll('.canvas-card.is-selected[data-type="note"]').forEach((element) => {
        positionNoteToolbar(element, $('.note-format-toolbar', element));
    });
});
window.addEventListener('beforeunload', (event) => {
    if (!unsavableNoteIds.size) return;
    event.preventDefault();
    event.returnValue = '';
});
window.addEventListener('pagehide', () => { flushSaves().catch(() => undefined); });
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSaves().catch(() => undefined);
});

async function initialize() {
    try {
        boards = await listBoards();
        const preferredId = await getSetting('current-board-id');
        if (!boards.length) {
            const board = createBoard({ id: uuid(), name: 'My board' });
            await saveBoard(board);
            boards = [board];
        }
        const board = boards.find((item) => item.id === preferredId) ?? boards[0];
        await openBoard(board);
    } catch (error) {
        console.error('Could not initialize sticky board', error);
        setStatus('Browser storage unavailable — notes cannot be saved');
        const fallback = createBoard({ id: uuid(), name: 'Unsaved board' });
        boards = [fallback];
        currentBoard = fallback;
        cards = [];
        renderBoardOptions();
        renderCards();
        applyViewport();
    }
}

initialize();
