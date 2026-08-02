import assert from 'node:assert/strict';
import test from 'node:test';

import { createArtifactFiles, createWorkspaceBackup, validateWorkspaceBackup } from '../src/domain/artifacts.js';

test('documentation artifact pack contains editable source, rendered formats, and repository guidance', () => {
    const files = createArtifactFiles({
        name: 'Payment Architecture',
        sceneJson: '{"type":"excalidraw"}',
        svgText: '<svg></svg>',
        pngBytes: new Uint8Array([1, 2, 3]),
        updatedAt: 123,
    });

    assert.deepEqual(Object.keys(files).sort(), [
        'payment-architecture/README.md',
        'payment-architecture/payment-architecture.excalidraw',
        'payment-architecture/payment-architecture.png',
        'payment-architecture/payment-architecture.svg',
    ]);
    assert.match(files['payment-architecture/README.md'], /editable source/i);
    assert.ok(files['payment-architecture/payment-architecture.png'] instanceof Uint8Array);
});

test('workspace backups are versioned and reject malformed records', () => {
    const backup = createWorkspaceBackup({
        boards: [{ id: 'a', name: 'A', createdAt: 1, updatedAt: 2 }],
        scenes: { a: { type: 'excalidraw', version: 2, source: 'artifact-test', elements: [], appState: {}, files: {} } },
        libraryItems: [],
        installedPacks: ['systems-design'],
        exportedAt: 3,
    });
    assert.equal(backup.schemaVersion, 1);
    assert.deepEqual(validateWorkspaceBackup(backup), backup);

    const completeElement = structuredClone(backup);
    completeElement.scenes.a.elements = [{
        id: 'rectangle-1', type: 'rectangle', x: 0, y: 0, width: 100, height: 60, angle: 0,
        strokeColor: '#1e1e1e', backgroundColor: 'transparent', fillStyle: 'hachure',
        strokeWidth: 1, strokeStyle: 'solid', roughness: 1, opacity: 100, groupIds: [],
        frameId: null, index: 'a0', roundness: { type: 3 }, seed: 1, version: 1,
        versionNonce: 2, isDeleted: false, boundElements: [], updated: 1, link: null, locked: false,
    }];
    assert.equal(validateWorkspaceBackup(completeElement).scenes.a.elements.length, 1);

    const duplicateElements = structuredClone(completeElement);
    duplicateElements.scenes.a.elements.push(structuredClone(duplicateElements.scenes.a.elements[0]));
    assert.throws(() => validateWorkspaceBackup(duplicateElements), /Invalid workspace backup/);

    const incompleteImage = structuredClone(completeElement);
    incompleteImage.scenes.a.elements[0].type = 'image';
    incompleteImage.scenes.a.elements[0].fileId = null;
    assert.throws(() => validateWorkspaceBackup(incompleteImage), /Invalid workspace backup/);

    const incompleteArrow = structuredClone(completeElement);
    incompleteArrow.scenes.a.elements[0].type = 'arrow';
    assert.throws(() => validateWorkspaceBackup(incompleteArrow), /Invalid workspace backup/);

    assert.throws(() => validateWorkspaceBackup({ schemaVersion: 1, boards: [{}], scenes: {} }), /Invalid workspace backup/);

    const duplicateBoards = structuredClone(backup);
    duplicateBoards.boards.push({ ...duplicateBoards.boards[0] });
    assert.throws(() => validateWorkspaceBackup(duplicateBoards), /Invalid workspace backup/);

    const malformedScene = structuredClone(backup);
    malformedScene.scenes.a.elements = 'not-an-array';
    assert.throws(() => validateWorkspaceBackup(malformedScene), /Invalid workspace backup/);

    const unboundedName = structuredClone(backup);
    unboundedName.boards[0].name = 'x'.repeat(81);
    assert.throws(() => validateWorkspaceBackup(unboundedName), /Invalid workspace backup/);

    const malformedElement = structuredClone(backup);
    malformedElement.scenes.a.elements = [null];
    assert.throws(() => validateWorkspaceBackup(malformedElement), /Invalid workspace backup/);

    const extraScene = structuredClone(backup);
    extraScene.scenes.orphan = backup.scenes.a;
    assert.throws(() => validateWorkspaceBackup(extraScene), /Invalid workspace backup/);

    const invalidTimestamp = structuredClone(backup);
    invalidTimestamp.boards[0].updatedAt = 0;
    assert.throws(() => validateWorkspaceBackup(invalidTimestamp), /Invalid workspace backup/);

    for (const dangerousId of ['__proto__', 'prototype', 'constructor']) {
        const dangerous = structuredClone(backup);
        dangerous.boards[0].id = dangerousId;
        dangerous.scenes = JSON.parse(`{"${dangerousId}":${JSON.stringify(backup.scenes.a)}}`);
        assert.throws(() => validateWorkspaceBackup(dangerous), /Invalid workspace backup/);
    }

    for (const dangerousKey of ['__proto__', 'prototype', 'constructor']) {
        const dangerousTop = JSON.parse(JSON.stringify(backup));
        Object.defineProperty(dangerousTop, dangerousKey, {
            value: { polluted: true }, enumerable: true, configurable: true,
        });
        assert.throws(() => validateWorkspaceBackup(dangerousTop), /Invalid workspace backup/);

        const dangerousBoard = structuredClone(backup);
        Object.defineProperty(dangerousBoard.boards[0], dangerousKey, {
            value: { polluted: true }, enumerable: true, configurable: true,
        });
        assert.throws(() => validateWorkspaceBackup(dangerousBoard), /Invalid workspace backup/);
    }

    const incompleteElement = structuredClone(backup);
    incompleteElement.scenes.a.elements = [{ id: 'e', type: 'rectangle', x: 0, y: 0 }];
    assert.throws(() => validateWorkspaceBackup(incompleteElement), /Invalid workspace backup/);

    const unsafeAppState = structuredClone(backup);
    unsafeAppState.scenes.a.appState = JSON.parse('{"__proto__":{"polluted":true}}');
    assert.throws(() => validateWorkspaceBackup(unsafeAppState), /Invalid workspace backup/);

    const inheritedAppState = structuredClone(backup);
    Object.setPrototypeOf(inheritedAppState.scenes.a.appState, { polluted: true });
    assert.throws(() => validateWorkspaceBackup(inheritedAppState), /Invalid workspace backup/);

    const oversizedFiles = structuredClone(backup);
    oversizedFiles.scenes.a.files = Object.fromEntries(Array.from({ length: 5_001 }, (_, index) => [`file-${index}`, {
        id: `file-${index}`,
        dataURL: 'data:image/png;base64,AA==',
        mimeType: 'image/png',
        created: 1,
    }]));
    assert.throws(() => validateWorkspaceBackup(oversizedFiles), /Invalid workspace backup/);
});

test('workspace validation accepts complete pinned Excalidraw element schemas and enforces references', () => {
    const base = (id, type) => ({
        id, type, x: 0, y: 0, width: 100, height: 60, angle: 0,
        strokeColor: '#1e1e1e', backgroundColor: 'transparent', fillStyle: 'hachure',
        strokeWidth: 1, strokeStyle: 'solid', roughness: 1, opacity: 100, groupIds: [],
        frameId: null, index: `a${id.length}`, roundness: null, seed: 1, version: 1,
        versionNonce: 2, isDeleted: false, boundElements: [], updated: 1, link: null, locked: false,
    });
    const elements = [
        base('rectangle', 'rectangle'),
        base('diamond', 'diamond'),
        base('ellipse', 'ellipse'),
        base('embed', 'embeddable'),
        base('iframe', 'iframe'),
        { ...base('frame', 'frame'), name: 'Frame' },
        { ...base('magic', 'magicframe'), name: null },
        {
            ...base('text', 'text'), fontSize: 20, fontFamily: 5, text: 'Text',
            textAlign: 'center', verticalAlign: 'middle', containerId: null,
            originalText: 'Text', autoResize: true, lineHeight: 1.25,
        },
        {
            ...base('line', 'line'), points: [[0, 0], [100, 0]], lastCommittedPoint: null,
            startBinding: null, endBinding: null, startArrowhead: null, endArrowhead: null,
        },
        {
            ...base('arrow', 'arrow'), points: [[0, 0], [100, 0]], lastCommittedPoint: null,
            startBinding: null, endBinding: null, startArrowhead: null, endArrowhead: 'arrow', elbowed: false,
        },
        {
            ...base('draw', 'freedraw'), points: [[0, 0], [1, 1]], pressures: [0.5, 0.5],
            simulatePressure: false, lastCommittedPoint: null,
        },
        {
            ...base('image', 'image'), fileId: 'file-1', status: 'saved', scale: [1, 1], crop: null,
        },
    ];
    const files = {
        'file-1': {
            id: 'file-1', mimeType: 'image/png', dataURL: 'data:image/png;base64,iVBORw0KGgo=',
            created: 1, lastRetrieved: 2, version: 1,
        },
    };
    const backup = createWorkspaceBackup({
        boards: [{ id: 'types', name: 'Types', createdAt: 1, updatedAt: 2 }],
        scenes: {
            types: {
                type: 'excalidraw', version: 2, source: 'artifact-test', elements,
                appState: { gridModeEnabled: false, gridSize: 20, gridStep: 5, viewBackgroundColor: '#fff' }, files,
            },
        },
        libraryItems: [], installedPacks: [], exportedAt: 3,
    });
    assert.equal(validateWorkspaceBackup(backup).scenes.types.elements.length, elements.length);

    const missingFile = structuredClone(backup);
    missingFile.scenes.types.files = {};
    assert.throws(() => validateWorkspaceBackup(missingFile), /Invalid workspace backup/);

    const invalidContainer = structuredClone(backup);
    invalidContainer.scenes.types.elements.find((element) => element.type === 'text').containerId = 'missing';
    assert.throws(() => validateWorkspaceBackup(invalidContainer), /Invalid workspace backup/);
});
