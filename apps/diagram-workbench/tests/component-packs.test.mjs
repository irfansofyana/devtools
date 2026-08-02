import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    COMPONENT_LIBRARY_REVISION,
    componentPacks,
    deferredCloudPacks,
    getComponentPack,
} from '../src/domain/component-packs.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('component packs are pinned local assets with provenance and no runtime network dependency', async () => {
    assert.equal(componentPacks.length, 3);
    assert.match(COMPONENT_LIBRARY_REVISION, /^[a-f0-9]{40}$/);
    assert.deepEqual(componentPacks.map(({ id }) => id), [
        'software-architecture',
        'system-design',
        'c4-architecture',
    ]);

    for (const pack of componentPacks) {
        assert.match(pack.source, /^component-packs\/[a-z0-9-]+\.excalidrawlib$/);
        assert.ok(pack.license);
        assert.ok(pack.attribution);
        assert.match(pack.sha256, /^[a-f0-9]{64}$/);
        assert.match(pack.upstream, new RegExp(COMPONENT_LIBRARY_REVISION));
        assert.ok(pack.license && pack.attribution && pack.provenance);
        const localPath = resolve(root, `public/${pack.source}`);
        assert.ok(existsSync(localPath), pack.source);
        assert.equal(createHash('sha256').update(await readFile(localPath)).digest('hex'), pack.sha256);
    }
});

test('ambiguous cloud icon redistribution is deferred to official sources', () => {
    assert.deepEqual(deferredCloudPacks.map(({ name }) => name), [
        'AWS Architecture Icons',
        'Google Cloud icons',
        'Kubernetes artwork',
        'Azure architecture icons',
    ]);
    assert.ok(deferredCloudPacks.every(({ officialUrl, reason }) => officialUrl.startsWith('https://') && reason));
});

test('component pack lookup returns a copy and rejects unknown packs', () => {
    const pack = getComponentPack('system-design');
    pack.name = 'changed';
    assert.notEqual(getComponentPack('system-design').name, 'changed');
    assert.throws(() => getComponentPack('missing'), /Unknown component pack/);
});
