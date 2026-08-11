import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

import * as stickyDomain from '../js/sticky-board-domain.mjs';
import {
    BACKUP_TYPE,
    SCHEMA_VERSION,
    annotateMarkdownTasks,
    createBoard,
    createCard,
    listMarkdownTasks,
    migrateCard,
    normalizeViewport,
    renormalizeZOrder,
    richTextToPlainText,
    toggleMarkdownTask,
    validateWorkspaceBackup,
} from '../js/sticky-board-domain.mjs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('sticky board creates safe named boards and typed cards', () => {
    const board = createBoard({ id: 'board-1', name: '  Work ideas  ', now: 100 });
    assert.deepEqual(board, {
        id: 'board-1',
        name: 'Work ideas',
        createdAt: 100,
        updatedAt: 100,
        viewport: { x: 0, y: 0, zoom: 1 },
    });

    const note = createCard({ id: 'note-1', type: 'note', x: 40, y: 80, width: 220, height: 160, now: 101 });
    assert.equal(note.type, 'note');
    assert.equal(note.width, 240);
    assert.equal(note.height, 170);
    assert.equal(note.contentFormat, 'tiptap-json');
    assert.equal(note.content.type, 'doc');
    assert.equal(note.content.content.at(-1).type, 'taskList');
    assert.equal(note.language, undefined);

    const code = createCard({ id: 'code-1', type: 'code', x: 120, y: 160, now: 102 });
    assert.equal(code.type, 'code');
    assert.equal(code.contentFormat, 'plain-text');
    assert.equal(code.language, 'javascript');
    assert.match(code.content, /console\.log/);
});

test('sticky board creates structured diagram shapes with bounded geometry', () => {
    assert.equal(typeof stickyDomain.createShape, 'function');
    const rectangle = stickyDomain.createShape({
        id: 'shape-1', boardId: 'board-1', shape: 'rectangle',
        x: 20, y: 40, width: 30, height: 20, label: '  System  ', now: 110,
    });
    assert.deepEqual(rectangle, {
        id: 'shape-1', boardId: 'board-1', type: 'shape', shape: 'rectangle',
        x: 20, y: 40, width: 80, height: 60, label: 'System',
        fill: 'blue', stroke: 'ink', strokeStyle: 'solid', z: 1,
        createdAt: 110, updatedAt: 110,
    });

    const text = stickyDomain.createShape({ id: 'text-1', shape: 'text', now: 111 });
    assert.equal(text.width, 240);
    assert.equal(text.height, 80);
    assert.equal(text.label, 'Text');
    assert.equal(text.fill, 'transparent');
    assert.equal(text.stroke, 'transparent');
    assert.equal(stickyDomain.createShape({ id: 'blank-shape', label: '' }).label, '');
    assert.throws(() => stickyDomain.createShape({ id: 'shape-bad', shape: 'triangle' }), /shape kind/i);
    assert.equal(migrateCard(rectangle), rectangle);
});

test('anchored connectors resolve exact horizontal and vertical endpoints', () => {
    assert.equal(typeof stickyDomain.createConnector, 'function');
    assert.equal(typeof stickyDomain.resolveConnectorGeometry, 'function');
    const source = stickyDomain.createShape({
        id: 'source', boardId: 'board-1', shape: 'rectangle', x: 100, y: 100, width: 200, height: 100,
    });
    const target = stickyDomain.createShape({
        id: 'target', boardId: 'board-1', shape: 'ellipse', x: 500, y: 100, width: 200, height: 100,
    });
    const horizontal = stickyDomain.createConnector({
        id: 'line-horizontal', boardId: 'board-1',
        from: { entityId: source.id, anchor: 'right' },
        to: { entityId: target.id, anchor: 'left' },
        label: 'depends on', now: 120,
    });
    assert.deepEqual(stickyDomain.resolveConnectorGeometry(horizontal, [source, target]), {
        x1: 300, y1: 150, x2: 500, y2: 150,
    });

    const below = stickyDomain.createShape({
        id: 'below', boardId: 'board-1', shape: 'rounded', x: 100, y: 400, width: 200, height: 100,
    });
    const vertical = stickyDomain.createConnector({
        id: 'line-vertical', boardId: 'board-1',
        from: { entityId: source.id, anchor: 'bottom' },
        to: { entityId: below.id, anchor: 'top' },
    });
    assert.deepEqual(stickyDomain.resolveConnectorGeometry(vertical, [source, below]), {
        x1: 200, y1: 200, x2: 200, y2: 400,
    });
    assert.deepEqual(stickyDomain.chooseConnectorAnchors(source, target), { from: 'right', to: 'left' });
    assert.deepEqual(stickyDomain.chooseConnectorAnchors(source, below), { from: 'bottom', to: 'top' });
});

test('deleting an object also identifies its attached connectors', () => {
    assert.equal(typeof stickyDomain.collectDeletionIds, 'function');
    const entities = [
        { id: 'shape-1', type: 'shape' },
        { id: 'shape-2', type: 'shape' },
        { id: 'shape-3', type: 'shape' },
        { id: 'line-1', type: 'connector', from: { entityId: 'shape-1' }, to: { entityId: 'shape-2' } },
        { id: 'line-2', type: 'connector', from: { entityId: 'shape-2' }, to: { entityId: 'shape-3' } },
    ];
    assert.deepEqual(stickyDomain.collectDeletionIds('shape-1', entities), ['shape-1', 'line-1']);
    assert.deepEqual(stickyDomain.collectDeletionIds('line-2', entities), ['line-2']);
});

test('viewport visibility detects boards that need a mobile fit', () => {
    assert.equal(typeof stickyDomain.hasVisibleCanvasEntity, 'function');
    const entities = [stickyDomain.createShape({ id: 'offscreen', x: 530, y: 306, width: 220, height: 120 })];
    assert.equal(stickyDomain.hasVisibleCanvasEntity(entities, { x: 0, y: 0, zoom: 1 }, { width: 390, height: 700 }), false);
    assert.equal(stickyDomain.hasVisibleCanvasEntity(entities, { x: 0, y: 0, zoom: 1 }, { width: 1280, height: 700 }), true);
    assert.equal(stickyDomain.hasVisibleCanvasEntity(entities, { x: -500, y: -280, zoom: 1 }, { width: 390, height: 700 }), true);
});

test('legacy note cards migrate without losing Markdown', () => {
    const migrated = migrateCard({
        id: 'legacy-note', boardId: 'board-1', type: 'note', x: 1, y: 2,
        width: 300, height: 240, title: 'Old note', content: '- [ ] Keep me',
        color: 'yellow', z: 1, createdAt: 10, updatedAt: 10,
    });
    assert.equal(migrated.contentFormat, 'markdown');
    assert.equal(migrated.content, '- [ ] Keep me');
    assert.equal(migrated.legacyMarkdown, '- [ ] Keep me');
    assert.equal(migrated.width, 300);
    assert.equal(migrateCard({ ...migrated, width: 220 }).width, 240);
    assert.equal(migrateCard({ ...migrated, height: 160 }).height, 170);
});

test('schema v2 backups migrate to the unified canvas schema without changing cards', () => {
    const board = createBoard({ id: 'board-v2', name: 'Existing notes', now: 100 });
    const card = createCard({ id: 'note-v2', type: 'note', boardId: board.id, now: 101 });
    const legacy = {
        type: BACKUP_TYPE,
        schemaVersion: 2,
        exportedAt: 200,
        currentBoardId: board.id,
        boards: [board],
        cards: [card],
    };

    const migrated = validateWorkspaceBackup(legacy);
    assert.equal(SCHEMA_VERSION, 3);
    assert.equal(migrated.schemaVersion, 3);
    assert.deepEqual(migrated.cards, [card]);
    assert.notEqual(migrated, legacy);
});

test('rich-text documents provide searchable portable plain text', () => {
    const note = createCard({ id: 'note-text', type: 'note' });
    assert.equal(richTextToPlainText(note.content), 'New note\nCapture the thought. Shape it later.\nFirst task');
    assert.equal(richTextToPlainText({ type: 'doc', content: [{ type: 'paragraph' }] }), '');
});

test('z-order renormalization keeps cards inside the backup schema', () => {
    const cards = [
        createCard({ id: 'high', z: 1_000_000 }),
        createCard({ id: 'low', z: 2 }),
        createCard({ id: 'middle', z: 40 }),
    ];
    assert.equal(renormalizeZOrder(cards), 3);
    assert.deepEqual(cards.map(({ id, z }) => ({ id, z })), [
        { id: 'high', z: 3 },
        { id: 'low', z: 1 },
        { id: 'middle', z: 2 },
    ]);
});

test('Markdown tasks support mixed markers and ignore fenced code', () => {
    const markdown = '```md\n- [x] fake\n```\n    - [x] indented code\n- [ ] dash\n* [x] star\n  + [ ] nested';
    assert.deepEqual(listMarkdownTasks(markdown).map((task) => task.checked), [false, true, false]);
    assert.equal(
        toggleMarkdownTask(markdown, 2, true),
        '```md\n- [x] fake\n```\n    - [x] indented code\n- [ ] dash\n* [x] star\n  + [x] nested',
    );
    const annotated = annotateMarkdownTasks(markdown, 'nonce');
    assert.match(annotated, /- \[ \] <span data-sticky-task="nonce:0"><\/span>dash/);
    assert.doesNotMatch(annotated, /fake<span data-sticky-task/);
    const trickyFence = '```md\n```not-a-close\n- [ ] still code\n```\n- [ ] outside';
    assert.deepEqual(listMarkdownTasks(trickyFence).map((task) => task.checked), [false]);
    assert.match(annotateMarkdownTasks(trickyFence, 'fence'), /- \[ \] <span data-sticky-task="fence:0"><\/span>outside/);
    assert.doesNotMatch(annotateMarkdownTasks(trickyFence, 'fence'), /still code<span data-sticky-task/);
    const nestedTask = '- parent\n    - [ ] child';
    assert.equal(listMarkdownTasks(nestedTask).length, 1);
    assert.match(annotateMarkdownTasks(nestedTask, 'nested'), /\[ \] <span data-sticky-task="nested:0"><\/span>child/);
});

test('annotated Markdown tasks still render as interactive task inputs', () => {
    const context = { globalThis: {} };
    vm.runInNewContext(read('vendor/sticky-board/marked.min.js'), context);
    const marked = context.globalThis.marked ?? context.marked;
    const html = marked.parse(annotateMarkdownTasks('- [ ] Buy milk', 'render'));
    assert.match(html, /<input[^>]+type="checkbox"/);
    assert.match(html, /data-sticky-task="render:0"/);
});

test('viewport normalization clamps unsafe pan and zoom values', () => {
    assert.deepEqual(normalizeViewport({ x: Infinity, y: -50, zoom: 99 }), { x: 0, y: -50, zoom: 2.5 });
    assert.deepEqual(normalizeViewport({ x: 10, y: 20, zoom: 0.01 }), { x: 10, y: 20, zoom: 0.25 });
});

test('workspace backups accept complete valid workspaces and reject unsafe content', () => {
    const board = createBoard({ id: 'board-1', name: 'Ideas', now: 100 });
    const card = createCard({ id: 'note-1', type: 'note', boardId: board.id, now: 101 });
    const backup = {
        type: BACKUP_TYPE,
        schemaVersion: SCHEMA_VERSION,
        exportedAt: 200,
        currentBoardId: board.id,
        boards: [board],
        cards: [card],
    };

    assert.deepEqual(validateWorkspaceBackup(backup), backup);
    const orderedDocument = {
        type: 'doc',
        content: [{ type: 'orderedList', attrs: { start: 1, type: null }, content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First' }] }] }] }],
    };
    assert.doesNotThrow(() => validateWorkspaceBackup({ ...backup, cards: [{ ...card, content: orderedDocument }] }));
    const emptyCodeBlock = { type: 'doc', content: [{ type: 'codeBlock', attrs: { language: null } }] };
    assert.doesNotThrow(() => validateWorkspaceBackup({ ...backup, cards: [{ ...card, content: emptyCodeBlock }] }));
    assert.throws(
        () => validateWorkspaceBackup({ ...backup, cards: [{ ...card, content: { type: 'doc', content: [] } }] }),
        /Invalid sticky-board backup/,
    );
    assert.throws(
        () => validateWorkspaceBackup({ ...backup, boards: [{ ...board, id: '__proto__' }] }),
        /Invalid sticky-board backup/,
    );
    assert.throws(
        () => validateWorkspaceBackup({ ...backup, cards: [{ ...card, content: 'x'.repeat(200_001) }] }),
        /Invalid sticky-board backup/,
    );
    const unsafeLink = {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'click', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] }],
    };
    assert.throws(
        () => validateWorkspaceBackup({ ...backup, cards: [{ ...card, content: unsafeLink }] }),
        /Invalid sticky-board backup/,
    );
    const unsafeClass = {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'styled', marks: [{ type: 'link', attrs: { href: 'https://example.com', class: 'canvas-card' } }] }] }],
    };
    assert.throws(
        () => validateWorkspaceBackup({ ...backup, cards: [{ ...card, content: unsafeClass }] }),
        /Invalid sticky-board backup/,
    );
    const malformedDocument = {
        type: 'doc',
        content: [{ type: 'text', text: 'parent', content: [{ type: 'text', text: 'impossible' }] }],
    };
    assert.throws(
        () => validateWorkspaceBackup({ ...backup, cards: [{ ...card, content: malformedDocument }] }),
        /Invalid sticky-board backup/,
    );
});

test('workspace backups validate shapes and reject malformed diagram records', () => {
    const board = createBoard({ id: 'shape-board', name: 'Diagram', now: 100 });
    const shape = stickyDomain.createShape({ id: 'shape-valid', boardId: board.id, shape: 'ellipse', now: 101 });
    const backup = {
        type: BACKUP_TYPE,
        schemaVersion: SCHEMA_VERSION,
        exportedAt: 200,
        currentBoardId: board.id,
        boards: [board],
        cards: [shape],
    };

    assert.deepEqual(validateWorkspaceBackup(backup), backup);
    assert.doesNotThrow(() => validateWorkspaceBackup({ ...backup, cards: [{ ...shape, label: '' }] }));
    assert.throws(
        () => validateWorkspaceBackup({ ...backup, cards: [{ ...shape, shape: 'triangle' }] }),
        /Invalid sticky-board backup/,
    );
    assert.throws(
        () => validateWorkspaceBackup({ ...backup, cards: [{ ...shape, label: 'x'.repeat(501) }] }),
        /Invalid sticky-board backup/,
    );
});

test('workspace backups accept anchored connectors and reject dangling references', () => {
    const board = createBoard({ id: 'connector-board', name: 'Flow', now: 100 });
    const source = stickyDomain.createShape({ id: 'connector-source', boardId: board.id, shape: 'rectangle', now: 101 });
    const target = createCard({ id: 'connector-target', boardId: board.id, type: 'note', now: 102 });
    const connector = stickyDomain.createConnector({
        id: 'connector-valid', boardId: board.id,
        from: { entityId: source.id, anchor: 'right' },
        to: { entityId: target.id, anchor: 'left' },
        now: 103,
    });
    const backup = {
        type: BACKUP_TYPE,
        schemaVersion: SCHEMA_VERSION,
        exportedAt: 200,
        currentBoardId: board.id,
        boards: [board],
        cards: [source, target, connector],
    };

    assert.deepEqual(validateWorkspaceBackup(backup), backup);
    assert.throws(
        () => validateWorkspaceBackup({
            ...backup,
            cards: [source, target, { ...connector, to: { entityId: 'missing', anchor: 'left' } }],
        }),
        /Invalid sticky-board backup/,
    );
    assert.throws(
        () => validateWorkspaceBackup({
            ...backup,
            cards: [source, target, { ...connector, from: { entityId: connector.id, anchor: 'right' } }],
        }),
        /Invalid sticky-board backup/,
    );
});

test('homepage exposes a standalone sticky board and required local-first controls', () => {
    const index = read('index.html');
    assert.match(index, /href="tools\/sticky-board\.html"/);
    assert.ok(existsSync(new URL('tools/sticky-board.html', root)));

    const page = read('tools/sticky-board.html');
    assert.match(page, /name="viewport" content="width=device-width, initial-scale=1\.0, viewport-fit=cover"/);
    assert.match(page, /id="sticky-canvas"/);
    assert.match(page, /id="add-note"[^>]*>[^<]*Add note/);
    assert.match(page, /id="add-code"[^>]*>[^<]*Add code/);
    assert.match(page, /class="quick-create"[^>]*aria-label="Add objects"/);
    assert.match(page, /class="canvas-dock"[^>]*aria-label="Canvas view controls"/);
    assert.equal((page.match(/id="add-note"/g) ?? []).length, 1);
    assert.equal((page.match(/id="add-code"/g) ?? []).length, 1);
    assert.match(page, /id="empty-open-shapes"[^>]*>Add shapes/);
    assert.doesNotMatch(page, /A quiet place for loud ideas|Add notes, code, shapes, labels, and arrows/);
    for (const shape of ['rectangle', 'rounded', 'ellipse', 'diamond', 'text', 'connector']) {
        assert.match(page, new RegExp(`id="add-${shape}"`));
    }
    assert.match(page, /id="shape-template"/);
    assert.match(page, /class="card-duplicate"/);
    assert.match(page, /class="shape-send-back"/);
    assert.match(page, /class="shape-bring-front"/);
    assert.match(page, /class="shape-drag"/);
    assert.match(page, /id="connector-layer"/);
    assert.match(page, /id="board-select"/);
    assert.match(page, /id="export-workspace"/);
    assert.match(page, /id="import-workspace-input"/);
    assert.match(page, /id="storage-status"[^>]*aria-live="polite"/);
    assert.match(page, /class="note-format-toolbar"[^>]*role="toolbar"/);
    assert.match(page, /class="note-editor"/);
    for (const action of ['bold', 'italic', 'strike', 'task-list', 'bullet-list']) {
        assert.match(page, new RegExp(`data-editor-action="${action}"`));
    }
    assert.match(page, /class="text-size"/);
    assert.match(page, /value="1\.35rem"/);
    assert.doesNotMatch(page, /pinch/i);
    assert.match(page, /tiptap-editor\.mjs/);
    assert.match(page, /marked\.min\.js/);
    assert.match(page, /purify\.min\.js/);
    assert.match(page, /prism\.js/);
    assert.doesNotMatch(page, /https?:\/\/cdn|unpkg\.com/);

    const css = read('css/sticky-board.css');
    assert.match(css, /\.quick-create\s*\{/);
    assert.match(css, /@media \(max-width: 620px\)[\s\S]*?\.canvas-dock\s*\{\s*display:\s*none;/);
    assert.match(css, /@media \(max-height: 500px\)[\s\S]*?\.canvas-dock\s*\{\s*display:\s*none;/);
    assert.match(css, /\.card-title\s*\{[^}]*width:\s*0;/s);
    assert.match(css, /--card-ink:/);
    assert.match(css, /\.canvas-dock\s*\{/);
    assert.match(css, /\.sticky-app\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?overflow:\s*hidden;/);
    assert.match(css, /\.sticky-app\s*\{[\s\S]*?min-height:\s*0;/);
    assert.match(css, /html\s*\{[^}]*overflow:\s*hidden;/s);
    assert.match(css, /height:\s*100dvh/);
    assert.match(css, /env\(safe-area-inset-bottom/);
    assert.match(css, /\.note-editor__content\s*\{/);
    assert.match(css, /\.note-editor__content li\[data-checked\]\s*\{[^}]*display:\s*flex;/s);
    assert.match(css, /\.canvas-card\.is-selected\[data-type="note"\] \.note-format-toolbar/);
    assert.match(css, /@media \(max-width: 620px\)[\s\S]*?\.search-control:focus-within input/);
    assert.doesNotMatch(css, /\.board-menu\s*\{\s*display:\s*none/);
    assert.doesNotMatch(css, /\.search-control\s*\{\s*display:\s*none/);
});

test('sticky board storage uses IndexedDB rather than localStorage for workspace data', () => {
    const storage = read('js/sticky-board-storage.mjs');
    const app = read('js/sticky-board.mjs');

    assert.match(storage, /indexedDB\.open/);
    assert.match(storage, /objectStoreNames\.contains\('boards'\)/);
    assert.match(storage, /objectStoreNames\.contains\('cards'\)/);
    assert.doesNotMatch(`${storage}\n${app}`, /localStorage\.(?:setItem|getItem).*?(?:board|card|workspace)/i);
    assert.match(app, /navigator\.storage\.persist/);
    for (const helper of ['createShape', 'createConnector', 'resolveConnectorGeometry', 'collectDeletionIds']) {
        assert.match(app, new RegExp(helper));
    }
    assert.match(app, /function renderShapes/);
    assert.match(app, /function renderConnectors/);
    assert.match(app, /document\.activeElement\?\.closest\?\.\('\.canvas-card, \.canvas-shape'\)/);
    assert.match(app, /\['Enter', ' '\]\.includes\(event\.key\)/);
    assert.match(app, /function resizeShapeLabel/);
    assert.match(app, /function duplicateCanvasEntity/);
    assert.match(app, /function changeEntityLayer/);
    assert.match(storage, /export async function deleteCards\(ids\)/);
    assert.match(app, /wrapper\.querySelectorAll\('input'\)/);
    assert.match(app, /USE_PROFILES:\s*\{\s*html:\s*true\s*\}/);
    assert.match(app, /FORBID_TAGS:\s*\[[^\]]*'video'[^\]]*'audio'/);
    assert.doesNotMatch(app, /FORBID_TAGS:\s*\[[^\]]*'input'/);
    assert.match(app, /if \(cards\.some\(\(card\) => card\.updatedAtDirty\)\) await persistDirtyCards\(\)/);
    assert.match(app, /if \(currentBoard\?\.updatedAtDirty\) await persistDirtyBoard\(\)/);
    assert.match(app, /const revision = board\.updatedAtDirty/);
    assert.match(app, /board\.updatedAtDirty === revision/);
    assert.match(app, /await writeQueue;\s*\}/);
    assert.match(app, /async function addCard[\s\S]*?await queueWrite\(\(\) => saveCard\(card\)\)[\s\S]*?cards\.push\(card\)/);
    const deleteFunction = app.slice(app.indexOf('async function deleteCanvasEntity'), app.indexOf('async function duplicateCanvasEntity'));
    const duplicateFunction = app.slice(app.indexOf('async function duplicateCanvasEntity'), app.indexOf('function changeEntityLayer'));
    assert.match(deleteFunction, /if \(!canUseDurableNotes\(\)\) return false;/);
    assert.match(duplicateFunction, /if \(!canUseDurableNotes\(\)\) return false;/);
    assert.doesNotMatch(deleteFunction, /renderCards\(\)/);
    assert.doesNotMatch(duplicateFunction, /renderCards\(\)/);
    assert.match(app, /function positionNoteToolbar[\s\S]*?window\.innerWidth - margin/);
    assert.match(app, /requestAnimationFrame\(\(\) => positionNoteToolbar/);
    assert.doesNotMatch(app, /emptyState|#empty-state/);
    assert.match(duplicateFunction, /appendCanvasEntity\(duplicate\)/);
    assert.match(app, /function handleConnectorActivationKey[\s\S]*?handleConnectorTarget\(entity, element\)/);
    assert.match(app, /setAttribute\('aria-label', `\$\{shape\.shape\} shape:/);
    assert.match(app, /setAttribute\('aria-label', `\$\{card\.type === 'code'/);
    assert.match(app, /async function deleteCanvasEntity[\s\S]*?collectDeletionIds\(entity\.id, cards\)[\s\S]*?await flushSaves\(\)[\s\S]*?await queueWrite\(\(\) => deleteCards\(ids\)\)[\s\S]*?cards = cards\.filter/);
    assert.match(app, /function setBoardControlsDisabled/);
    assert.match(app, /\$\('\.sticky-header'\)\.inert = busy/);
    assert.match(app, /canvas\.inert = busy/);
    assert.match(app, /canvas\.setAttribute\('aria-busy', String\(busy\)\)/);
    assert.match(app, /async function openBoard\(board\)[\s\S]*?setBoardControlsDisabled\(true\)[\s\S]*?finally/);
    assert.match(app, /delete-board[\s\S]*?await flushSaves\(\)[\s\S]*?deleteBoard\(id\)/);
    assert.match(app, /const offset = \(cards\.length % 8\) \* 28/);
    assert.match(app, /const revision = card\.updatedAtDirty/);
    assert.match(app, /card\.updatedAtDirty === revision/);
    assert.match(app, /createNoteEditor\(\{/);
    assert.match(app, /card\.contentFormat = 'tiptap-json'/);
    assert.match(app, /card\.legacyMarkdown = String\(card\.content\)/);
    assert.match(app, /unsavableNoteIds\.add\(card\.id\)/);
    assert.match(app, /if \(unsavableNoteIds\.size\)[\s\S]*?shorten it before leaving/);
    assert.match(app, /beforeunload[\s\S]*?event\.preventDefault\(\)/);
    assert.match(app, /\$\('#delete-board'\)\.addEventListener\('click', async \(\) => \{\s*if \(!canUseDurableNotes\(\)\) return;/);
    assert.match(app, /\$\('#import-workspace-input'\)\.addEventListener\('change', async \(event\) => \{[^]*?if \(!file\) return;\s*if \(!canUseDurableNotes\(\)\) return;/);
    assert.match(app, /cards\.some\(\(card, index\) => card !== storedCards\[index\]\)/);
    assert.match(app, /Math\.max\(240, start\.width/);
    assert.match(app, /Math\.max\(170, start\.height/);
    assert.match(app, /resizeControl\.addEventListener\('keydown'/);
    assert.match(app, /storedCards\.map\(migrateCard\)/);
    assert.match(app, /richTextToPlainText\(card\.content\)/);
    assert.match(app, /event\.target\.closest\('input, textarea, select, \[contenteditable="true"\]'\)/);
    assert.match(app, /function nextZIndex/);
    assert.match(app, /z:\s*nextZIndex\(\)/);
    assert.match(app, /let workspaceReplaced = false/);
    assert.match(app, /Backup was restored, but the board could not be opened/);
    assert.match(app, /Backup could not be restored — nothing was replaced/);
    assert.match(app, /else if \(hasDirtyChanges\(\)\) setStatus\('Local save failed — export before leaving'\)/);
    assert.doesNotMatch(app, /saveFailed/);
    assert.match(app, /retryTimer/);
    assert.match(app, /Saving locally/);
    assert.match(app, /Saved locally/);
});

test('vendored sticky-board libraries match reviewed integrity hashes', () => {
    const expected = {
        'marked.min.js': 'ba65f1c8948e6b01321399800843e9048b31e1c197652d4b0fafae840b30e32b',
        'purify.min.js': '9ab3d44d73c3e3947f9ab72e0f0bc15c7f1931d60b365ba261fc85fe59013c56',
        'prism.js': 'b801451d9b4cbf1857715a97ecae442e26c111bab6e19fee0e83dfda70cc2900',
        'prism-python.min.js': 'ed4385685bcf2d4935c8dbbab4bde16603da1329e092d2bf36c3dadd67e9a85c',
        'prism-bash.min.js': '6260814110e5182f2956e3bd257429548d9dbf2a9b66a63719b26cf9fac966a7',
        'prism-json.min.js': '956d86baa5ae7ec4106758f354ac2d140bdcd7fc103dece02f73ed12b8d663e4',
        'prism-typescript.min.js': '852f5513bb9ca9db247f86ecfce74acc91c541749d34929157240518fef8152a',
        'prism-sql.min.js': '3fc5f8ce69950ec73adc972f061df42aaea78faa4864709134ea2adc083f3a33',
        'prism-yaml.min.js': '719c8e8b8c344dc9de510c729f65ba840b1502a0a8e7e25e2ad19ee715f65c02',
        'tiptap-editor.mjs': '10106d816926fd473fd8da42e3fb4d9a57c3ab7402af2b4ef5e5b281af444a04',
        'tiptap-editor.NOTICE.md': '777b765b1513a8eadc0d801c47c6164e31ee43ec38faac41195b759af0645a0f',
    };
    for (const [filename, digest] of Object.entries(expected)) {
        const bytes = readFileSync(new URL(`vendor/sticky-board/${filename}`, root));
        assert.equal(createHash('sha256').update(bytes).digest('hex'), digest, filename);
    }
});
