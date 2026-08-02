export const COMPONENT_LIBRARY_REVISION = '92e1979e8157da0ad9c2bd912c01ea9381d1733f';
const repository = `https://github.com/excalidraw/excalidraw-libraries/blob/${COMPONENT_LIBRARY_REVISION}/libraries`;

export const componentPacks = [
    {
        id: 'software-architecture',
        name: 'Software architecture',
        category: 'Generic',
        description: 'Microservices, databases, caches, pipelines, browsers, mobile clients, and code artifacts.',
        source: 'component-packs/software-architecture.excalidrawlib',
        upstream: `${repository}/youritjang/software-architecture.excalidrawlib`,
        attribution: 'Youri Tjang',
        provenance: 'Submitted to excalidraw-libraries in PR #16; pinned repository path and revision.',
        license: 'MIT',
        sha256: '5dead109b7569066a5fd3c2bcfe5f045c156f27a391eed71e6dd640b4317ce65',
    },
    {
        id: 'system-design',
        name: 'System design',
        category: 'Generic',
        description: 'Reusable high-level components for distributed systems and engineering diagrams.',
        source: 'component-packs/system-design.excalidrawlib',
        upstream: `${repository}/rohanp/system-design.excalidrawlib`,
        attribution: 'Rohan Pithadiya',
        provenance: 'Submitted to excalidraw-libraries in PR #188; pinned repository path and revision.',
        license: 'MIT',
        sha256: '4042532130ed87478388d28d4177177423c52ef7953c570822d60695a0b74bf7',
    },
    {
        id: 'c4-architecture',
        name: 'C4 architecture',
        category: 'Method',
        description: 'People, systems, containers, components, relationships, and C4 boundaries.',
        source: 'component-packs/c4-architecture.excalidrawlib',
        upstream: `${repository}/dmitry-burnyshev/c4-architecture.excalidrawlib`,
        attribution: 'Dmitry Burnyshev; based on the C4 model by Simon Brown',
        attributionUrl: 'https://c4model.com/',
        provenance: 'Submitted by Dmitry Burnyshev; pinned repository path and revision; C4 attribution retained.',
        license: 'MIT; C4 model website CC BY 4.0',
        sha256: '54f7841eb8b24dcfab0230761f4d5099c29eacacb48b83f8856a2d70aaf15679',
    },
];

export const deferredCloudPacks = [
    {
        name: 'AWS Architecture Icons',
        officialUrl: 'https://aws.amazon.com/architecture/icons/',
        reason: 'Official terms permit architecture-diagram use but do not clearly permit repackaging as a downloadable component library.',
    },
    {
        name: 'Google Cloud icons',
        officialUrl: 'https://cloud.google.com/icons',
        reason: 'The available community conversion is stale and has no documented standalone redistribution chain.',
    },
    {
        name: 'Kubernetes artwork',
        officialUrl: 'https://www.linuxfoundation.org/legal/trademark-usage',
        reason: 'The strongest community candidate still needs standalone redistribution approval and Linux Foundation trademark treatment.',
    },
    {
        name: 'Azure architecture icons',
        officialUrl: 'https://learn.microsoft.com/en-us/azure/architecture/icons/',
        reason: 'Microsoft permits specific diagram and documentation uses, but public library redistribution remains ambiguous.',
    },
];

export function getComponentPack(id) {
    const pack = componentPacks.find((candidate) => candidate.id === id);
    if (!pack) throw new Error(`Unknown component pack: ${id}`);
    return structuredClone(pack);
}
