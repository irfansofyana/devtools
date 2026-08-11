import { getConnectionGeometry } from './layout.js';

const KIND_STYLE = {
    client: { backgroundColor: '#e7f5ff', strokeColor: '#1971c2' },
    person: { backgroundColor: '#fff3bf', strokeColor: '#e67700', shape: 'ellipse' },
    network: { backgroundColor: '#e5dbff', strokeColor: '#6741d9' },
    data: { backgroundColor: '#d3f9d8', strokeColor: '#2b8a3e' },
    event: { backgroundColor: '#fff0f6', strokeColor: '#c2255c' },
    ops: { backgroundColor: '#f1f3f5', strokeColor: '#495057' },
    external: { backgroundColor: '#fff4e6', strokeColor: '#d9480f' },
    code: { backgroundColor: '#e6fcf5', strokeColor: '#087f5b' },
    system: { backgroundColor: '#dbe4ff', strokeColor: '#364fc7' },
    service: { backgroundColor: '#edf2ff', strokeColor: '#4263eb' },
    'sticky-yellow': { backgroundColor: '#fff3bf', strokeColor: '#f08c00' },
    'sticky-pink': { backgroundColor: '#ffd8f4', strokeColor: '#a61e4d' },
    'sticky-blue': { backgroundColor: '#e7f5ff', strokeColor: '#1971c2' },
    'sticky-green': { backgroundColor: '#d3f9d8', strokeColor: '#2b8a3e' },
    topic: { backgroundColor: '#dbe4ff', strokeColor: '#5b76fe' },
    callout: { backgroundColor: '#ffc6c6', strokeColor: '#c92a2a' },
    'lane-blue': { backgroundColor: '#dbe4ff', strokeColor: '#5b76fe' },
    'lane-yellow': { backgroundColor: '#fff3bf', strokeColor: '#f08c00' },
    'lane-pink': { backgroundColor: '#ffd8f4', strokeColor: '#a61e4d' },
    'lane-green': { backgroundColor: '#d3f9d8', strokeColor: '#2b8a3e' },
};

export function templateToSkeletons(template) {
    const shapes = template.nodes.map((node) => {
        const style = KIND_STYLE[node.kind] ?? KIND_STYLE.service;
        return {
            id: `template-${template.id}-${node.id}`,
            type: style.shape ?? 'rectangle',
            x: node.x,
            y: node.y,
            width: node.width,
            height: node.height,
            backgroundColor: style.backgroundColor,
            strokeColor: style.strokeColor,
            fillStyle: 'solid',
            roughness: 1,
            roundness: { type: 3 },
            label: {
                text: node.label,
                fontSize: 18,
                textAlign: 'center',
                verticalAlign: 'middle',
            },
        };
    });

    const nodesById = new Map(template.nodes.map((node, index) => [node.id, {
        ...node,
        type: shapes[index].type,
    }]));
    const arrows = template.edges.map((connection, index) => {
        const startNode = nodesById.get(connection.from);
        const endNode = nodesById.get(connection.to);
        if (!startNode || !endNode) throw new Error(`Template ${template.id} contains a dangling connection.`);
        return {
            id: `template-${template.id}-edge-${index}`,
            type: 'arrow',
            ...getConnectionGeometry(startNode, endNode, 14, 14),
            start: { id: `template-${template.id}-${connection.from}` },
            end: { id: `template-${template.id}-${connection.to}` },
            strokeColor: '#495057',
            endArrowhead: 'arrow',
            roughness: 1,
            ...(connection.label ? { label: { text: connection.label, fontSize: 14 } } : {}),
        };
    });

    return [...shapes, ...arrows];
}
