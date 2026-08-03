import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('homepage exposes the isolated diagram workbench without loading its React bundle', () => {
    const index = read('index.html');
    assert.match(index, /href="tools\/diagram-workbench\/"/);
    assert.match(index, /diagram-workbench/);
    assert.doesNotMatch(index, /@excalidraw|react-dom|apps\/diagram-workbench/);
});

test('diagram workbench is local-first, lazy-loads component packs, and avoids runtime third-party CDNs', () => {
    const app = read('apps/diagram-workbench/src/App.jsx');
    const css = read('apps/diagram-workbench/src/styles.css');
    const packs = read('apps/diagram-workbench/src/domain/component-packs.js');
    const packageJson = JSON.parse(read('apps/diagram-workbench/package.json'));

    assert.equal(packageJson.dependencies['@excalidraw/excalidraw'], '0.18.1');
    assert.equal(packageJson.dependencies['@excalidraw/mermaid-to-excalidraw'], '2.2.2');
    assert.equal(packageJson.dependencies['@dagrejs/dagre'], '3.0.0');
    assert.equal(packageJson.dependencies.fflate, '0.8.3');
    assert.match(packageJson.scripts.build, /copy-excalidraw-assets/);
    assert.match(read('apps/diagram-workbench/index.html'), /EXCALIDRAW_ASSET_PATH/);
    assert.match(app, /Mermaid to editable canvas/);
    assert.match(app, /arrangeSelection/);
    assert.match(app, /Documentation pack/);
    assert.match(app, /IndexedDB|Stored in this browser/);
    assert.match(app, /validateEmbeddable=\{rejectRemoteEmbeddable\}/);
    assert.match(app, /renderEmbeddable=\{renderLocalOnlyEmbeddable\}/);
    assert.match(app, /currentToken\(\) !== preparationToken/);
    assert.match(app, /runWorkspaceOperation\(`export-\$\{format\}`/);
    assert.match(app, /runWorkspaceOperation\('export-documentation-pack'/);
    assert.match(app, /runWorkspaceOperation\('install-component-pack'/);
    assert.match(app, /createDefaultLibraryMigration/);
    assert.match(app, /default-library-version/);
    assert.match(app, /Irfan Core is ready/);
    assert.match(app, /className="pack-state">Ready<\/span>/);
    assert.doesNotMatch(app, /<button[^>]*disabled>Ready<\/button>/);
    assert.match(app, /viewBackgroundColor: '#ffffff'/);
    assert.match(app, /theme="light"/);
    assert.match(css, /\.canvas-region[\s\S]*?background: #ffffff;/);
    assert.match(css, /\.sidebar-scrim:not\(\.is-visible\)[\s\S]*?visibility: hidden;/);
    assert.match(css, /@media \(max-width: 1100px\)[\s\S]*?\.mobile-action-menu[\s\S]*?display: block;/);
    assert.match(app, /await libraryWriteQueueRef\.current\.flush\(\)/);
    assert.match(app, /libraryWriteQueueRef\.current\.enqueue\(libraryItems\)/);
    assert.doesNotMatch(app, /editor\?\.updateLibrary/);
    assert.match(app, /updateSettingsAtomically\(/);
    assert.match(app, /updateLibraryItems\(/);
    assert.doesNotMatch(app, /setSetting\('library-items'/);
    assert.match(app, /fetch\(`\$\{import\.meta\.env\.BASE_URL\}\$\{pack\.source\}`\)/);
    assert.doesNotMatch(app, /fetch\([^)]*https?:\/\//);
    assert.doesNotMatch(app, /localStorage\.setItem\([^)]*(scene|elements|files|library)/i);
    assert.equal((packs.match(/source: 'component-packs\//g) ?? []).length, 3);
    assert.match(packs, /deferredCloudPacks/);
});

test('Pages workflow builds the isolated Vite app before Jekyll packaging', () => {
    const workflow = read('.github/workflows/deploy-github-pages.yml');
    assert.match(workflow, /actions\/setup-node@v4/);
    assert.match(workflow, /npm ci/);
    assert.match(workflow, /node --test tests\/\*\.test\.mjs/);
    assert.match(workflow, /npm run build/);
    assert.ok(workflow.indexOf('npm run build') < workflow.indexOf('jekyll-build-pages'));
});

test('production diagram artifact contains pinned local component packs', () => {
    for (const filename of [
        'software-architecture.excalidrawlib',
        'system-design.excalidrawlib',
        'c4-architecture.excalidrawlib',
    ]) {
        assert.ok(existsSync(new URL(`apps/diagram-workbench/public/component-packs/${filename}`, root)), filename);
    }
});
