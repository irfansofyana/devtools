import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import {
    BACKUP_TYPE,
    createBoard,
    createCard,
    normalizeViewport,
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

    const note = createCard({ id: 'note-1', type: 'note', x: 40, y: 80, now: 101 });
    assert.equal(note.type, 'note');
    assert.match(note.content, /Markdown/);
    assert.equal(note.language, undefined);

    const code = createCard({ id: 'code-1', type: 'code', x: 120, y: 160, now: 102 });
    assert.equal(code.type, 'code');
    assert.equal(code.language, 'javascript');
    assert.match(code.content, /console\.log/);
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
        schemaVersion: 1,
        exportedAt: 200,
        currentBoardId: board.id,
        boards: [board],
        cards: [card],
    };

    assert.deepEqual(validateWorkspaceBackup(backup), backup);
    assert.throws(
        () => validateWorkspaceBackup({ ...backup, boards: [{ ...board, id: '__proto__' }] }),
        /Invalid sticky-board backup/,
    );
    assert.throws(
        () => validateWorkspaceBackup({ ...backup, cards: [{ ...card, content: 'x'.repeat(200_001) }] }),
        /Invalid sticky-board backup/,
    );
});

test('homepage exposes a standalone sticky board and required local-first controls', () => {
    const index = read('index.html');
    assert.match(index, /href="tools\/sticky-board\.html"/);
    assert.ok(existsSync(new URL('tools/sticky-board.html', root)));

    const page = read('tools/sticky-board.html');
    assert.match(page, /id="sticky-canvas"/);
    assert.match(page, /id="add-note"/);
    assert.match(page, /id="add-code"/);
    assert.match(page, /id="board-select"/);
    assert.match(page, /id="export-workspace"/);
    assert.match(page, /id="import-workspace-input"/);
    assert.match(page, /id="storage-status"[^>]*aria-live="polite"/);
    assert.match(page, /marked\.min\.js/);
    assert.match(page, /purify\.min\.js/);
    assert.match(page, /prism\.js/);
    assert.doesNotMatch(page, /https?:\/\/cdn|unpkg\.com/);

    const css = read('css/sticky-board.css');
    assert.match(css, /\.empty-state\[hidden\]\s*\{\s*display:\s*none;/);
    assert.match(css, /\.card-title\s*\{[^}]*width:\s*0;/s);
    assert.match(css, /\.card-toolbar select[^}]*width:\s*auto;/s);
});

test('sticky board storage uses IndexedDB rather than localStorage for workspace data', () => {
    const storage = read('js/sticky-board-storage.mjs');
    const app = read('js/sticky-board.mjs');

    assert.match(storage, /indexedDB\.open/);
    assert.match(storage, /objectStoreNames\.contains\('boards'\)/);
    assert.match(storage, /objectStoreNames\.contains\('cards'\)/);
    assert.doesNotMatch(`${storage}\n${app}`, /localStorage\.(?:setItem|getItem).*?(?:board|card|workspace)/i);
    assert.match(app, /navigator\.storage\.persist/);
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
    assert.match(app, /card-delete[\s\S]*?await flushSaves\(\)[\s\S]*?await queueWrite\(\(\) => deleteCard\(card\.id\)\)[\s\S]*?cards = cards\.filter/);
    assert.match(app, /function setBoardControlsDisabled/);
    assert.match(app, /\$\('\.sticky-header'\)\.inert = busy/);
    assert.match(app, /canvas\.inert = busy/);
    assert.match(app, /canvas\.setAttribute\('aria-busy', String\(busy\)\)/);
    assert.match(app, /async function openBoard\(board\)[\s\S]*?setBoardControlsDisabled\(true\)[\s\S]*?finally/);
    assert.match(app, /delete-board[\s\S]*?await flushSaves\(\)[\s\S]*?deleteBoard\(id\)/);
    assert.match(app, /const offset = \(cards\.length % 8\) \* 28/);
    assert.match(app, /const revision = card\.updatedAtDirty/);
    assert.match(app, /card\.updatedAtDirty === revision/);
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
    };
    for (const [filename, digest] of Object.entries(expected)) {
        const bytes = readFileSync(new URL(`vendor/sticky-board/${filename}`, root));
        assert.equal(createHash('sha256').update(bytes).digest('hex'), digest, filename);
    }
});
