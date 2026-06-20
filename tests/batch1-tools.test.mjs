import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);

function read(path) {
    return readFileSync(new URL(path, root), 'utf8');
}

test('Batch 1 tools are linked from the homepage and have pages', () => {
    const index = read('index.html');
    const expectedTools = [
        ['tools/json-escape-unescape.html', 'json-escape'],
        ['tools/html-entity-encoder-decoder.html', 'html-entities'],
        ['tools/hmac-generator.html', 'hmac'],
        ['tools/chmod-calculator.html', 'chmod'],
    ];

    expectedTools.forEach(([href, name]) => {
        assert.ok(index.includes(`href="${href}"`), `${href} should be linked from index.html`);
        assert.ok(index.includes(`<span class="tool__name">${name}</span>`), `${name} should be named on index.html`);
        assert.ok(existsSync(new URL(href, root)), `${href} should exist`);
    });
});

test('UUID generator exposes v4, v7, and ULID generation modes', () => {
    const uuidPage = read('tools/uuid-generator.html');

    assert.match(uuidPage, /value="v4"/);
    assert.match(uuidPage, /value="v7"/);
    assert.match(uuidPage, /value="ulid"/);
    assert.match(uuidPage, /function generateUUIDv7/);
    assert.match(uuidPage, /function generateULID/);
});

test('Vim editor loads CodeMirror simple mode before Rust mode', () => {
    const vimPage = read('tools/vim-editor.html');
    const simpleModeIndex = vimPage.indexOf('addon/mode/simple');
    const rustModeIndex = vimPage.indexOf('mode/rust/rust');

    assert.ok(simpleModeIndex > -1, 'CodeMirror simple mode addon should be loaded');
    assert.ok(simpleModeIndex < rustModeIndex, 'simple mode addon should load before Rust mode');
});

test('Batch 2 tools are linked from the homepage and have pages', () => {
    const index = read('index.html');
    const expectedTools = [
        ['tools/sql-formatter.html', 'sql-formatter'],
        ['tools/xml-tool.html', 'xml-tool'],
        ['tools/json-diff-patch.html', 'json-diff'],
    ];

    expectedTools.forEach(([href, name]) => {
        assert.ok(index.includes(`href="${href}"`), `${href} should be linked from index.html`);
        assert.ok(index.includes(`<span class="tool__name">${name}</span>`), `${name} should be named on index.html`);
        assert.ok(existsSync(new URL(href, root)), `${href} should exist`);
    });
});

test('Batch 2 pages expose the requested core capabilities', () => {
    const sqlPage = read('tools/sql-formatter.html');
    assert.match(sqlPage, /function formatSQL/);
    assert.match(sqlPage, /function minifySQL/);

    const xmlPage = read('tools/xml-tool.html');
    assert.match(xmlPage, /function formatXML/);
    assert.match(xmlPage, /function validateXML/);
    assert.match(xmlPage, /function xmlToJSON/);
    assert.match(xmlPage, /function jsonToXML/);

    const jsonDiffPage = read('tools/json-diff-patch.html');
    assert.match(jsonDiffPage, /function diffValues/);
    assert.match(jsonDiffPage, /function createPatch/);
    assert.match(jsonDiffPage, /function applyPatch/);
});

test('SQL formatter uses a real SQL editor and formatter library', () => {
    const sqlPage = read('tools/sql-formatter.html');

    assert.match(sqlPage, /codemirror\/5\.65\.13\/codemirror\.min\.css/);
    assert.match(sqlPage, /mode\/sql\/sql\.min\.js/);
    assert.match(sqlPage, /CodeMirror\.fromTextArea/);
    assert.match(sqlPage, /sql-formatter@15\.8\.1\/\+esm/);
});

test('JSON formatter output uses a local JSON viewer palette', () => {
    const jsonPage = read('tools/json-formatter.html');

    assert.match(jsonPage, /class="tool-page-shell json-tool"/);
    assert.match(jsonPage, /json-output-shell/);
    assert.match(jsonPage, /json-output-meta/);
    assert.match(jsonPage, /--json-property/);
    assert.doesNotMatch(jsonPage, /themes\/prism(?:-dark)?\.min\.css/);
});

test('workbench CSS isolates embedded JSONEditor from global form and table styles', () => {
    const workbenchCss = read('css/workbench.css');

    assert.match(workbenchCss, /\.jsoneditor/);
    assert.match(workbenchCss, /\.jsoneditor input/);
    assert.match(workbenchCss, /\.jsoneditor table/);
    assert.match(workbenchCss, /\.jsoneditor td/);
});
