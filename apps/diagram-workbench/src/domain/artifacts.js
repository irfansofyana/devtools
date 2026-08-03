import { DEFAULT_LIBRARY_VERSION } from './default-library.js';

function slugify(value) {
    return String(value || 'diagram')
        .normalize('NFKD')
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80)
        .toLowerCase() || 'diagram';
}

export function createArtifactFiles({ name, sceneJson, svgText, pngBytes, updatedAt }) {
    const slug = slugify(name);
    const directory = `${slug}/`;
    const readme = `# ${name}\n\nTechnical diagram exported from [tools.irfansp.dev](https://tools.irfansp.dev/tools/diagram-workbench/).\n\n## Files\n\n- \`${slug}.excalidraw\` — editable source; keep this file under version control.\n- \`${slug}.svg\` — scalable documentation image.\n- \`${slug}.png\` — raster preview for tools that do not render SVG.\n\nLast updated: ${new Date(updatedAt).toISOString()}\n`;

    return {
        [`${directory}${slug}.excalidraw`]: sceneJson,
        [`${directory}${slug}.svg`]: svgText,
        [`${directory}${slug}.png`]: pngBytes,
        [`${directory}README.md`]: readme,
    };
}

export function createWorkspaceBackup({ boards, scenes, libraryItems, installedPacks, defaultLibraryVersion = 0, exportedAt = Date.now() }) {
    return {
        type: 'tools-diagram-workspace',
        schemaVersion: 1,
        exportedAt,
        boards: structuredClone(boards),
        scenes: structuredClone(scenes),
        libraryItems: structuredClone(libraryItems ?? []),
        installedPacks: [...(installedPacks ?? [])],
        defaultLibraryVersion,
    };
}

export function validateWorkspaceBackup(value) {
    const forbiddenKeys = new Set(['__proto__', 'prototype', 'constructor']);
    const isRecord = (item) => item !== null
        && typeof item === 'object'
        && !Array.isArray(item)
        && (Object.getPrototypeOf(item) === Object.prototype || Object.getPrototypeOf(item) === null);
    const safeTree = (item, depth = 0) => {
        if (item === null || typeof item === 'string' || typeof item === 'boolean') return true;
        if (typeof item === 'number') return Number.isFinite(item);
        if (depth >= 20) return false;
        if (Array.isArray(item)) return item.length <= 100_000 && item.every((entry) => safeTree(entry, depth + 1));
        if (!isRecord(item)) return false;
        const keys = Object.keys(item);
        return keys.length <= 100_000
            && keys.every((key) => !forbiddenKeys.has(key) && safeTree(item[key], depth + 1));
    };
    const hasOnlyKeys = (record, allowed) => Object.keys(record).every((key) => allowed.has(key));
    const validEntityId = (id) => typeof id === 'string'
        && id.length > 0
        && id.length <= 128
        && !forbiddenKeys.has(id)
        && /^[A-Za-z0-9._-]+$/.test(id);
    const validPoint = (point) => Array.isArray(point)
        && point.length === 2
        && Number.isFinite(point[0])
        && Number.isFinite(point[1]);
    const validNullablePoint = (point) => point === null || validPoint(point);
    const validBinding = (binding) => binding === null || (isRecord(binding)
        && safeTree(binding)
        && validEntityId(binding.elementId)
        && Number.isFinite(binding.focus)
        && Number.isFinite(binding.gap)
        && (binding.fixedPoint === undefined || validPoint(binding.fixedPoint)));
    const arrowheads = new Set([
        'arrow', 'bar', 'circle', 'circle_outline', 'crowfoot_many', 'crowfoot_one',
        'crowfoot_one_or_many', 'diamond', 'diamond_outline', 'dot', 'triangle', 'triangle_outline',
    ]);
    const validArrowhead = (arrowhead) => arrowhead === null || arrowheads.has(arrowhead);
    const supportedElementTypes = new Set([
        'arrow', 'diamond', 'ellipse', 'embeddable', 'frame', 'freedraw', 'iframe',
        'image', 'line', 'magicframe', 'rectangle', 'text',
    ]);
    const validCrop = (crop) => crop === null || (isRecord(crop)
        && ['x', 'y', 'width', 'height', 'naturalWidth', 'naturalHeight'].every((key) => Number.isFinite(crop[key]))
        && crop.x >= 0
        && crop.y >= 0
        && crop.width >= 0
        && crop.height >= 0
        && crop.naturalWidth > 0
        && crop.naturalHeight > 0
        && crop.x + crop.width <= crop.naturalWidth
        && crop.y + crop.height <= crop.naturalHeight);
    const validBaseElement = (element, { library = false } = {}) => isRecord(element)
        && safeTree(element)
        && validEntityId(element.id)
        && supportedElementTypes.has(element.type)
        && Number.isFinite(element.x)
        && Number.isFinite(element.y)
        && Number.isFinite(element.width)
        && element.width >= 0
        && Number.isFinite(element.height)
        && element.height >= 0
        && Number.isFinite(element.angle)
        && typeof element.strokeColor === 'string'
        && element.strokeColor.length > 0
        && element.strokeColor.length <= 128
        && typeof element.backgroundColor === 'string'
        && element.backgroundColor.length > 0
        && element.backgroundColor.length <= 128
        && ['hachure', 'cross-hatch', 'solid', 'zigzag'].includes(element.fillStyle)
        && Number.isFinite(element.strokeWidth)
        && element.strokeWidth >= 0
        && ['solid', 'dashed', 'dotted'].includes(element.strokeStyle)
        && Number.isFinite(element.roughness)
        && element.roughness >= 0
        && element.roughness <= 2
        && Number.isFinite(element.opacity)
        && element.opacity >= 0
        && element.opacity <= 100
        && Array.isArray(element.groupIds)
        && element.groupIds.length <= 10_000
        && element.groupIds.every(validEntityId)
        && new Set(element.groupIds).size === element.groupIds.length
        && (element.frameId === null || validEntityId(element.frameId))
        && (element.index === null || (typeof element.index === 'string' && element.index.length > 0 && element.index.length <= 64))
        && (element.roundness === null || (isRecord(element.roundness)
            && [1, 2, 3].includes(element.roundness.type)
            && (element.roundness.value === undefined || Number.isFinite(element.roundness.value))))
        && Number.isInteger(element.seed)
        && Number.isInteger(element.version)
        && element.version >= 1
        && Number.isInteger(element.versionNonce)
        && typeof element.isDeleted === 'boolean'
        && Number.isFinite(element.updated)
        && element.updated >= 0
        && typeof element.locked === 'boolean'
        && (element.link === null || (typeof element.link === 'string' && element.link.length <= 8_192))
        && (element.boundElements === null || (Array.isArray(element.boundElements)
            && element.boundElements.length <= 10_000
            && element.boundElements.every((bound) => isRecord(bound)
                && validEntityId(bound.id)
                && ['arrow', 'text'].includes(bound.type))))
        && (element.customData === undefined || (isRecord(element.customData) && safeTree(element.customData)))
        && (!library || element.index !== undefined);
    const validElement = (element, options) => {
        if (!validBaseElement(element, options)) return false;
        switch (element.type) {
            case 'text':
                return Number.isFinite(element.fontSize)
                    && element.fontSize > 0
                    && Number.isInteger(element.fontFamily)
                    && element.fontFamily > 0
                    && typeof element.text === 'string'
                    && element.text.length <= 1_000_000
                    && typeof element.originalText === 'string'
                    && element.originalText.length <= 1_000_000
                    && ['left', 'center', 'right'].includes(element.textAlign)
                    && ['top', 'middle', 'bottom'].includes(element.verticalAlign)
                    && (element.containerId === null || validEntityId(element.containerId))
                    && typeof element.autoResize === 'boolean'
                    && Number.isFinite(element.lineHeight)
                    && element.lineHeight > 0;
            case 'line':
            case 'arrow': {
                const validLinear = Array.isArray(element.points)
                    && element.points.length >= 2
                    && element.points.length <= 100_000
                    && element.points.every(validPoint)
                    && validNullablePoint(element.lastCommittedPoint)
                    && validBinding(element.startBinding)
                    && validBinding(element.endBinding)
                    && validArrowhead(element.startArrowhead)
                    && validArrowhead(element.endArrowhead);
                if (!validLinear) return false;
                if (element.type === 'line') return true;
                if (options?.library && element.elbowed === undefined) return true;
                if (typeof element.elbowed !== 'boolean') return false;
                if (!element.elbowed) return true;
                return (element.fixedSegments === null || (Array.isArray(element.fixedSegments)
                    && element.fixedSegments.every((segment) => isRecord(segment)
                        && validPoint(segment.start)
                        && validPoint(segment.end)
                        && Number.isInteger(segment.index))))
                    && (element.startIsSpecial === null || typeof element.startIsSpecial === 'boolean')
                    && (element.endIsSpecial === null || typeof element.endIsSpecial === 'boolean');
            }
            case 'freedraw':
                return Array.isArray(element.points)
                    && element.points.length > 0
                    && element.points.length <= 100_000
                    && element.points.every(validPoint)
                    && Array.isArray(element.pressures)
                    && (element.pressures.length === 0 || element.pressures.length === element.points.length)
                    && element.pressures.every((pressure) => Number.isFinite(pressure) && pressure >= 0 && pressure <= 1)
                    && typeof element.simulatePressure === 'boolean'
                    && validNullablePoint(element.lastCommittedPoint);
            case 'image':
                return (element.fileId === null || validEntityId(element.fileId))
                    && ['pending', 'saved', 'error'].includes(element.status)
                    && (element.status !== 'saved' || validEntityId(element.fileId))
                    && Array.isArray(element.scale)
                    && element.scale.length === 2
                    && element.scale.every((scale) => scale === -1 || scale === 1)
                    && validCrop(element.crop);
            case 'frame':
            case 'magicframe':
                return element.name === null || (typeof element.name === 'string' && element.name.length <= 500);
            default:
                return true;
        }
    };
    const validFiles = (files) => {
        if (!isRecord(files) || !safeTree(files) || Object.keys(files).length > 5_000) return false;
        let aggregateDataLength = 0;
        return Object.entries(files).every(([key, file]) => {
            aggregateDataLength += typeof file?.dataURL === 'string' ? file.dataURL.length : 0;
            const prefix = `data:${file?.mimeType};base64,`;
            const payload = typeof file?.dataURL === 'string' && file.dataURL.startsWith(prefix)
                ? file.dataURL.slice(prefix.length)
                : '';
            const validBase64 = payload.length > 0
                && payload.length % 4 === 0
                && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(payload);
            return validEntityId(key)
                && isRecord(file)
                && validEntityId(file.id)
                && file.id === key
                && /^image\/(?:png|jpeg|gif|webp|svg\+xml)$/.test(file.mimeType)
                && typeof file.dataURL === 'string'
                && validBase64
                && file.dataURL.length <= 25 * 1024 * 1024
                && aggregateDataLength <= 100 * 1024 * 1024
                && Number.isFinite(file.created)
                && file.created >= 0
                && (file.lastRetrieved === undefined || (Number.isFinite(file.lastRetrieved) && file.lastRetrieved >= 0))
                && (file.version === undefined || (Number.isInteger(file.version) && file.version >= 1));
        });
    };
    const validAppState = (appState) => isRecord(appState)
        && safeTree(appState)
        && hasOnlyKeys(appState, new Set(['gridModeEnabled', 'gridSize', 'gridStep', 'theme', 'viewBackgroundColor']))
        && (appState.theme === undefined || ['light', 'dark'].includes(appState.theme))
        && (appState.gridModeEnabled === undefined || typeof appState.gridModeEnabled === 'boolean')
        && (appState.gridSize === undefined || appState.gridSize === null || (Number.isFinite(appState.gridSize) && appState.gridSize > 0))
        && (appState.gridStep === undefined || (Number.isFinite(appState.gridStep) && appState.gridStep > 0))
        && (appState.viewBackgroundColor === undefined
            || (typeof appState.viewBackgroundColor === 'string' && appState.viewBackgroundColor.length <= 128));
    const validElementReferences = (elements, files, { library = false } = {}) => {
        const ids = elements.map((element) => element.id);
        if (new Set(ids).size !== ids.length) return false;
        const byId = new Map(elements.map((element) => [element.id, element]));
        if (library) return true;
        const bindableTypes = new Set(['rectangle', 'diamond', 'ellipse', 'text', 'image', 'iframe', 'embeddable', 'frame', 'magicframe']);
        const containerTypes = new Set(['rectangle', 'diamond', 'ellipse', 'arrow']);
        return elements.every((element) => {
            if (element.frameId !== null && !['frame', 'magicframe'].includes(byId.get(element.frameId)?.type)) return false;
            if (element.boundElements?.some((bound) => byId.get(bound.id)?.type !== bound.type)) return false;
            if (element.type === 'text' && element.containerId !== null
                && !containerTypes.has(byId.get(element.containerId)?.type)) return false;
            if (['line', 'arrow'].includes(element.type)) {
                for (const binding of [element.startBinding, element.endBinding]) {
                    if (binding !== null && !bindableTypes.has(byId.get(binding.elementId)?.type)) return false;
                }
            }
            if (!library && element.type === 'image' && element.fileId !== null && !Object.hasOwn(files, element.fileId)) return false;
            return true;
        });
    };
    const validScene = (scene) => {
        if (!isRecord(scene)
            || !safeTree(scene)
            || !hasOnlyKeys(scene, new Set(['type', 'version', 'source', 'elements', 'appState', 'files']))
            || scene.type !== 'excalidraw'
            || scene.version !== 2
            || typeof scene.source !== 'string'
            || scene.source.length > 2_048
            || !Array.isArray(scene.elements)
            || scene.elements.length > 50_000
            || !scene.elements.every((element) => validElement(element))
            || !validAppState(scene.appState)
            || !validFiles(scene.files)) return false;
        return validElementReferences(scene.elements, scene.files);
    };
    const validLibraryItem = (item) => isRecord(item)
        && safeTree(item)
        && validEntityId(item.id)
        && (item.status === undefined || ['published', 'unpublished'].includes(item.status))
        && (item.created === undefined || (Number.isFinite(item.created) && item.created >= 0))
        && Array.isArray(item.elements)
        && item.elements.length <= 2_000
        && item.elements.every((element) => validElement(element, { library: true }))
        && validElementReferences(item.elements, {}, { library: true });

    const boards = value?.boards;
    const boardIds = Array.isArray(boards) ? boards.map((board) => board?.id) : [];
    const uniqueBoardIds = new Set(boardIds);
    const scenes = value?.scenes;
    const valid = isRecord(value)
        && safeTree(value)
        && hasOnlyKeys(value, new Set(['type', 'schemaVersion', 'exportedAt', 'boards', 'scenes', 'libraryItems', 'installedPacks', 'defaultLibraryVersion']))
        && value.type === 'tools-diagram-workspace'
        && value.schemaVersion === 1
        && (value.defaultLibraryVersion === undefined
            || (Number.isInteger(value.defaultLibraryVersion) && value.defaultLibraryVersion >= 0 && value.defaultLibraryVersion <= DEFAULT_LIBRARY_VERSION))
        && Number.isFinite(value.exportedAt)
        && value.exportedAt >= 0
        && Array.isArray(boards)
        && boards.length > 0
        && boards.length <= 500
        && uniqueBoardIds.size === boards.length
        && isRecord(scenes)
        && Object.keys(scenes).length === boards.length
        && Object.keys(scenes).every((id) => uniqueBoardIds.has(id))
        && Array.isArray(value.libraryItems)
        && value.libraryItems.length <= 10_000
        && value.libraryItems.every(validLibraryItem)
        && new Set(value.libraryItems.map((item) => item.id)).size === value.libraryItems.length
        && Array.isArray(value.installedPacks)
        && value.installedPacks.length <= 100
        && value.installedPacks.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 64)
        && new Set(value.installedPacks).size === value.installedPacks.length
        && boards.every((board) => isRecord(board)
            && safeTree(board)
            && hasOnlyKeys(board, new Set(['id', 'name', 'createdAt', 'updatedAt', 'thumbnail']))
            && typeof board.id === 'string'
            && !forbiddenKeys.has(board.id)
            && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(board.id)
            && typeof board.name === 'string'
            && board.name === board.name.trim()
            && board.name.length > 0
            && board.name.length <= 80
            && Number.isFinite(board.createdAt)
            && board.createdAt >= 0
            && Number.isFinite(board.updatedAt)
            && board.updatedAt >= board.createdAt
            && board.updatedAt <= value.exportedAt + 300_000
            && (board.thumbnail === undefined || board.thumbnail === null
                || (typeof board.thumbnail === 'string' && board.thumbnail.length <= 1_000_000))
            && Object.hasOwn(scenes, board.id)
            && validScene(scenes[board.id]));
    if (!valid) throw new Error('Invalid workspace backup.');
    return structuredClone(value);
}
