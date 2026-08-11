const BLOCKS = {
    'sticky-note': {
        label: 'Sticky note',
        category: 'Thinking',
        description: 'A warm card for ideas, questions, and reminders.',
        skeletons: [{
            type: 'rectangle', width: 260, height: 180,
            backgroundColor: '#fff3bf', strokeColor: '#f08c00', fillStyle: 'solid',
            roughness: 1, roundness: { type: 3 },
            label: { text: 'Sticky note', fontSize: 24, textAlign: 'center', verticalAlign: 'middle' },
        }],
    },
    headline: {
        label: 'Heading',
        category: 'Thinking',
        description: 'A large title for a topic or canvas area.',
        skeletons: [{ type: 'text', width: 340, height: 56, text: 'New heading', fontSize: 36, strokeColor: '#1c1c1e' }],
    },
    section: {
        label: 'Section',
        category: 'Organize',
        description: 'A dashed container for grouping related work.',
        skeletons: [{
            type: 'rectangle', width: 640, height: 400,
            backgroundColor: 'transparent', strokeColor: '#5b76fe', fillStyle: 'solid',
            strokeStyle: 'dashed', roughness: 0, roundness: { type: 3 },
            label: { text: 'Section', fontSize: 22, textAlign: 'center', verticalAlign: 'top' },
        }],
    },
    process: {
        label: 'Process',
        category: 'Flowchart',
        description: 'A standard process or action step.',
        skeletons: [{
            type: 'rectangle', width: 220, height: 100,
            backgroundColor: '#c3faf5', strokeColor: '#187574', fillStyle: 'solid',
            roughness: 1, roundness: { type: 3 },
            label: { text: 'Process', fontSize: 20, textAlign: 'center', verticalAlign: 'middle' },
        }],
    },
    decision: {
        label: 'Decision',
        category: 'Flowchart',
        description: 'A branching question or decision point.',
        skeletons: [{
            type: 'diamond', width: 190, height: 150,
            backgroundColor: '#ffd8f4', strokeColor: '#a61e4d', fillStyle: 'solid', roughness: 1,
            label: { text: 'Decision?', fontSize: 19, textAlign: 'center', verticalAlign: 'middle' },
        }],
    },
    'start-end': {
        label: 'Start / End',
        category: 'Flowchart',
        description: 'A terminal for the beginning or end of a flow.',
        skeletons: [{
            type: 'ellipse', width: 190, height: 90,
            backgroundColor: '#e7f5ff', strokeColor: '#1971c2', fillStyle: 'solid', roughness: 1,
            label: { text: 'Start / End', fontSize: 19, textAlign: 'center', verticalAlign: 'middle' },
        }],
    },
    callout: {
        label: 'Callout',
        category: 'Thinking',
        description: 'A highlighted note for decisions or important context.',
        skeletons: [{
            type: 'rectangle', width: 300, height: 130,
            backgroundColor: '#ffc6c6', strokeColor: '#c92a2a', fillStyle: 'solid',
            roughness: 0, roundness: { type: 3 },
            label: { text: 'Important context', fontSize: 21, textAlign: 'center', verticalAlign: 'middle' },
        }],
    },
};

export const quickInsertCatalog = Object.entries(BLOCKS).map(([id, { label, category, description }]) => ({
    id, label, category, description,
}));

export function createQuickInsertSkeletons(id, center, instanceId) {
    const definition = BLOCKS[id];
    if (!definition) throw new Error(`Unknown quick insert: ${id}`);
    const centerX = Number(center?.x);
    const centerY = Number(center?.y);
    if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) throw new TypeError('Quick insert requires a finite canvas position.');
    const safeInstance = String(instanceId ?? '').replace(/[^a-z0-9_-]/gi, '').slice(0, 80);
    if (!safeInstance) throw new TypeError('Quick insert requires an instance id.');

    const source = definition.skeletons;
    const left = Math.min(...source.map(({ x = 0 }) => x));
    const top = Math.min(...source.map(({ y = 0 }) => y));
    const right = Math.max(...source.map(({ x = 0, width = 0 }) => x + width));
    const bottom = Math.max(...source.map(({ y = 0, height = 0 }) => y + height));
    const offsetX = centerX - (left + right) / 2;
    const offsetY = centerY - (top + bottom) / 2;

    return source.map((skeleton, index) => ({
        ...structuredClone(skeleton),
        id: `quick-${safeInstance}-${index}`,
        x: (skeleton.x ?? 0) + offsetX,
        y: (skeleton.y ?? 0) + offsetY,
    }));
}
