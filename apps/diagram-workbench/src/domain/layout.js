import dagre from '@dagrejs/dagre';

const LINEAR_TYPES = new Set(['arrow', 'line', 'freedraw']);

function boundaryRadius(element, unitX, unitY) {
    const halfWidth = Math.max(element.width / 2, 1);
    const halfHeight = Math.max(element.height / 2, 1);
    if (element.type === 'ellipse') {
        return 1 / Math.sqrt((unitX / halfWidth) ** 2 + (unitY / halfHeight) ** 2);
    }
    if (element.type === 'diamond') {
        return 1 / (Math.abs(unitX) / halfWidth + Math.abs(unitY) / halfHeight);
    }
    return 1 / Math.max(Math.abs(unitX) / halfWidth, Math.abs(unitY) / halfHeight);
}

export function getConnectionGeometry(startElement, endElement, startGap = 0, endGap = 0) {
    const startCenter = {
        x: startElement.x + startElement.width / 2,
        y: startElement.y + startElement.height / 2,
    };
    const endCenter = {
        x: endElement.x + endElement.width / 2,
        y: endElement.y + endElement.height / 2,
    };
    const deltaX = endCenter.x - startCenter.x;
    const deltaY = endCenter.y - startCenter.y;
    const distance = Math.hypot(deltaX, deltaY);
    const unitX = distance === 0 ? 1 : deltaX / distance;
    const unitY = distance === 0 ? 0 : deltaY / distance;
    const startRadius = boundaryRadius(startElement, unitX, unitY);
    const endRadius = boundaryRadius(endElement, unitX, unitY);
    const x = startCenter.x + unitX * (startRadius + Math.max(0, startGap));
    const y = startCenter.y + unitY * (startRadius + Math.max(0, startGap));
    const endX = endCenter.x - unitX * (endRadius + Math.max(0, endGap));
    const endY = endCenter.y - unitY * (endRadius + Math.max(0, endGap));
    const pointX = endX - x;
    const pointY = endY - y;
    return {
        x,
        y,
        width: Math.abs(pointX),
        height: Math.abs(pointY),
        points: [[0, 0], [pointX, pointY]],
    };
}

function isLayoutContainer(element) {
    return element && !element.isDeleted && element.type !== 'text' && !LINEAR_TYPES.has(element.type);
}

export function layoutSelectedElements(elements, selectedElementIds) {
    const selected = new Set(Object.entries(selectedElementIds ?? {})
        .filter(([, value]) => value)
        .map(([id]) => id));
    const nodes = elements
        .filter((element) => selected.has(element.id) && isLayoutContainer(element))
        .sort((left, right) => left.id.localeCompare(right.id));

    if (nodes.length < 2) throw new Error('Select at least two diagram components to arrange.');

    const graph = new dagre.graphlib.Graph({ multigraph: true });
    graph.setGraph({ rankdir: 'TB', ranksep: 100, nodesep: 70, marginx: 24, marginy: 24 });
    graph.setDefaultEdgeLabel(() => ({}));

    for (const node of nodes) graph.setNode(node.id, { width: node.width, height: node.height });

    const nodeIds = new Set(nodes.map(({ id }) => id));
    for (const element of elements.filter(({ type }) => type === 'arrow').sort((left, right) => left.id.localeCompare(right.id))) {
        const from = element.startBinding?.elementId;
        const to = element.endBinding?.elementId;
        if (nodeIds.has(from) && nodeIds.has(to)) graph.setEdge(from, to, {}, element.id);
    }

    dagre.layout(graph);

    const deltas = new Map();
    const positioned = new Map(nodes.map((node) => {
        const position = graph.node(node.id);
        const x = Math.round(position.x - node.width / 2);
        const y = Math.round(position.y - node.height / 2);
        deltas.set(node.id, { x: x - node.x, y: y - node.y });
        return [node.id, { x, y }];
    }));

    const positionedElements = new Map(elements.map((element) => {
        const position = positioned.get(element.id);
        return [element.id, position ? { ...element, ...position } : element];
    }));
    const updatedArrows = new Map();
    for (const arrow of elements.filter(({ type }) => type === 'arrow')) {
        const startId = arrow.startBinding?.elementId;
        const endId = arrow.endBinding?.elementId;
        if ((!positioned.has(startId) && !positioned.has(endId)) || !positionedElements.has(startId) || !positionedElements.has(endId)) continue;
        updatedArrows.set(arrow.id, {
            ...arrow,
            ...getConnectionGeometry(
                positionedElements.get(startId),
                positionedElements.get(endId),
                arrow.startBinding?.gap,
                arrow.endBinding?.gap,
            ),
            version: Number.isInteger(arrow.version) ? arrow.version + 1 : arrow.version,
        });
    }

    return elements.map((element) => {
        const positionedElement = positionedElements.get(element.id);
        if (positioned.has(element.id)) return positionedElement;
        const updatedArrow = updatedArrows.get(element.id);
        if (updatedArrow) return updatedArrow;
        if (element.type === 'text' && element.containerId) {
            const containerDelta = deltas.get(element.containerId);
            if (containerDelta) return { ...element, x: element.x + containerDelta.x, y: element.y + containerDelta.y };
            const arrow = updatedArrows.get(element.containerId);
            if (arrow) {
                const endPoint = arrow.points.at(-1);
                return {
                    ...element,
                    x: arrow.x + endPoint[0] / 2 - element.width / 2,
                    y: arrow.y + endPoint[1] / 2 - element.height / 2,
                };
            }
        }
        return element;
    });
}
