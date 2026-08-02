import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const toolFiles = readdirSync(new URL('tools/', root))
    .filter((name) => name.endsWith('.html'))
    .sort();

test('homepage exposes a navigable catalog and live search status', () => {
    const index = read('index.html');

    const componentsIndex = index.indexOf('css/components.css');
    const workbenchIndex = index.indexOf('css/workbench.css');
    assert.ok(workbenchIndex > componentsIndex, 'homepage should load workbench.css after components.css');
    assert.match(index, /class="catalog-layout"/);
    assert.match(index, /class="category-nav"[^>]*aria-label="Tool categories"/);
    assert.match(index, /id="search-status"[^>]*aria-live="polite"/);
    assert.match(index, /id="category-writing-text"/);
    assert.match(index, /href="#category-writing-text"/);
});

test('homepage search supports keyboard result navigation', () => {
    const search = read('js/search.js');

    assert.match(search, /ArrowDown/);
    assert.match(search, /ArrowUp/);
    assert.match(search, /activeResultIndex/);
    assert.match(search, /search-status/);
});

test('every tool page loads the workbench stylesheet statically without a JS-injected layout shift', () => {
    const main = read('js/main.js');
    assert.doesNotMatch(main, /loadWorkbenchStyles/);

    toolFiles.forEach((file) => {
        const html = read(`tools/${file}`);
        const componentsIndex = html.indexOf('../css/components.css');
        const workbenchIndex = html.indexOf('../css/workbench.css');
        const mainScriptIndex = html.indexOf('../js/main.js');

        assert.ok(componentsIndex >= 0, `${file} should load components.css`);
        assert.ok(workbenchIndex > componentsIndex, `${file} should load workbench.css after components.css`);
        assert.ok(workbenchIndex < mainScriptIndex, `${file} should load workbench.css before main.js`);
    });
});

test('every tool page has a skip link, main target, and consistent footer hook', () => {
    toolFiles.forEach((file) => {
        const html = read(`tools/${file}`);
        assert.match(html, /class="skip-link" href="#main-content"/, `${file} should have a skip link`);
        assert.match(html, /<main id="main-content">/, `${file} should expose the main landmark target`);
        assert.match(html, /<footer class="app-footer">/, `${file} should use the shared footer`);
    });
});

test('shared workbench styling uses an action hierarchy and directory rows instead of repeated open cards', () => {
    const css = read('css/workbench.css');

    assert.doesNotMatch(css, /content:\s*['"]open['"]/i);
    assert.match(css, /\.catalog-layout/);
    assert.match(css, /\.category-nav/);
    assert.match(css, /\.btn--primary[\s\S]*background:\s*var\(--accent\)/);
    assert.match(css, /\.tool-content:has\(> \.options-group \+ \.options-group\)/);
    assert.match(css, /\.tool-content > \.text-center/);
    assert.match(css, /--text-muted:\s*#68706b/);
    assert.match(css, /\.jsoneditor[^\{]*:focus-visible[\s\S]*outline/);
});
