export const DEFAULT_LIBRARY_VERSION = 1;

const PALETTE = {
    'AWS Core': { backgroundColor: '#fff4e6', strokeColor: '#e8590c', badgeColor: '#fd7e14', badgeText: 'AWS' },
    Kubernetes: { backgroundColor: '#e7f5ff', strokeColor: '#1971c2', badgeColor: '#228be6', badgeText: 'K8s' },
    'AI / LLM': { backgroundColor: '#f3f0ff', strokeColor: '#7048e8', badgeColor: '#845ef7', badgeText: 'AI' },
};

const AWS_COMPONENTS = [
    ['ec2', 'EC2'],
    ['lambda', 'Lambda'],
    ['eks', 'EKS'],
    ['vpc', 'VPC'],
    ['subnet', 'Subnet'],
    ['iam', 'IAM'],
    ['security-group', 'Security Group'],
    ['load-balancer', 'Load Balancer'],
    ['api-gateway', 'API Gateway'],
    ['cloudfront', 'CloudFront'],
    ['s3', 'S3'],
    ['rds-aurora', 'RDS / Aurora'],
    ['dynamodb', 'DynamoDB'],
    ['events-queue', 'SQS / EventBridge'],
];

const KUBERNETES_COMPONENTS = [
    ['cluster', 'Cluster'],
    ['node-group', 'Node Group'],
    ['namespace', 'Namespace'],
    ['pod', 'Pod'],
    ['deployment', 'Deployment'],
    ['statefulset', 'StatefulSet'],
    ['service', 'Service'],
    ['ingress-gateway', 'Ingress / Gateway'],
    ['config-secret', 'ConfigMap / Secret'],
];

const AI_COMPONENTS = [
    ['llm-gateway', 'LLM Gateway'],
    ['foundation-model', 'Foundation Model'],
    ['embedding-model', 'Embedding Model'],
    ['agent', 'Agent'],
    ['tool', 'Tool'],
    ['vector-database', 'Vector Database'],
    ['rag-pipeline', 'RAG Pipeline'],
    ['guardrail', 'Guardrail'],
    ['evaluation-tracing', 'Evaluation / Tracing'],
];

function cardSkeletons(id, name, category) {
    const style = PALETTE[category];
    const groupId = `${id}-group`;
    return [
        {
            id: `${id}-badge`,
            type: 'rectangle',
            x: 0,
            y: 0,
            width: 150,
            height: 32,
            backgroundColor: style.badgeColor,
            strokeColor: style.strokeColor,
            fillStyle: 'solid',
            roughness: 0,
            roundness: { type: 3 },
            groupIds: [groupId],
            label: {
                text: style.badgeText,
                fontSize: 14,
                textAlign: 'center',
                verticalAlign: 'middle',
                strokeColor: '#ffffff',
            },
        },
        {
            id: `${id}-card`,
            type: 'rectangle',
            x: 0,
            y: 32,
            width: 150,
            height: 88,
            backgroundColor: style.backgroundColor,
            strokeColor: style.strokeColor,
            fillStyle: 'solid',
            roughness: 0,
            roundness: { type: 3 },
            groupIds: [groupId],
            label: {
                text: name,
                fontSize: name.length > 15 ? 14 : 18,
                textAlign: 'center',
                verticalAlign: 'middle',
            },
        },
    ];
}

function cardDefinition(slug, name, category) {
    const id = `irfan-core-${slug}-v1`;
    return {
        id,
        name,
        category,
        introducedIn: 1,
        provenance: 'First-party original editable artwork',
        license: 'MIT',
        skeletons: cardSkeletons(id, name, category),
    };
}

function patternDefinition(slug, name, nodes, accent) {
    const id = `irfan-core-${slug}-v1`;
    const groupId = `${id}-group`;
    const nodePositions = [
        { x: 0, y: 70 },
        { x: 170, y: 70 },
        { x: 170, y: 200 },
        { x: 0, y: 200 },
    ];
    const edgeGeometry = [
        { x: 130, y: 105, points: [[0, 0], [40, 0]] },
        { x: 235, y: 140, points: [[0, 0], [0, 60]] },
        { x: 170, y: 235, points: [[0, 0], [-40, 0]] },
    ];
    const skeletons = [
        {
            id: `${id}-title`,
            type: 'text',
            x: 0,
            y: 0,
            text: name,
            fontSize: 22,
            strokeColor: '#343a40',
            groupIds: [groupId],
        },
        ...nodes.map((label, index) => ({
            id: `${id}-node-${index}`,
            type: 'rectangle',
            x: nodePositions[index].x,
            y: nodePositions[index].y,
            width: 130,
            height: 70,
            backgroundColor: index % 2 ? '#f8f9fa' : accent.backgroundColor,
            strokeColor: accent.strokeColor,
            fillStyle: 'solid',
            roughness: 0,
            roundness: { type: 3 },
            groupIds: [groupId],
            label: {
                text: label,
                fontSize: label.length > 13 ? 15 : 17,
                textAlign: 'center',
                verticalAlign: 'middle',
            },
        })),
        ...nodes.slice(1).map((_, index) => ({
            id: `${id}-edge-${index}`,
            type: 'arrow',
            x: edgeGeometry[index].x,
            y: edgeGeometry[index].y,
            points: edgeGeometry[index].points,
            strokeColor: accent.strokeColor,
            endArrowhead: 'arrow',
            roughness: 0,
            groupIds: [groupId],
        })),
    ];
    return {
        id,
        name,
        category: 'Patterns',
        introducedIn: 1,
        provenance: 'First-party original editable artwork',
        license: 'MIT',
        skeletons,
    };
}

export const defaultLibraryDefinitions = [
    ...AWS_COMPONENTS.map(([slug, name]) => cardDefinition(`aws-${slug}`, name, 'AWS Core')),
    ...KUBERNETES_COMPONENTS.map(([slug, name]) => cardDefinition(`k8s-${slug}`, name, 'Kubernetes')),
    ...AI_COMPONENTS.map(([slug, name]) => cardDefinition(`ai-${slug}`, name, 'AI / LLM')),
    patternDefinition('pattern-private-eks', 'Private EKS Platform', ['CloudFront', 'Load Balancer', 'Private EKS', 'RDS'], PALETTE['AWS Core']),
    patternDefinition('pattern-multi-az-vpc', 'Multi-AZ VPC', ['Public subnet', 'Private subnet A', 'Private subnet B', 'Data tier'], PALETTE['AWS Core']),
    patternDefinition('pattern-rag-app', 'RAG Application', ['Documents', 'Vector DB', 'RAG service', 'Foundation model'], PALETTE['AI / LLM']),
    patternDefinition('pattern-litellm', 'LiteLLM Gateway', ['Applications', 'LiteLLM', 'Guardrails', 'Model providers'], PALETTE['AI / LLM']),
];

export function applyLibraryItemsDelta(currentItems, previousItems, nextItems) {
    const current = Array.isArray(currentItems) ? currentItems : [];
    const previous = Array.isArray(previousItems) ? previousItems : [];
    const next = Array.isArray(nextItems) ? nextItems : [];
    const previousById = new Map(previous.map((item) => [item.id, item]));
    const nextById = new Map(next.map((item) => [item.id, item]));
    const removedIds = new Set(previous.filter(({ id }) => !nextById.has(id)).map(({ id }) => id));
    const changedById = new Map(next
        .filter((item) => !previousById.has(item.id)
            || JSON.stringify(previousById.get(item.id)) !== JSON.stringify(item))
        .map((item) => [item.id, item]));
    const merged = [];
    const presentIds = new Set();

    for (const item of current) {
        if (removedIds.has(item.id)) continue;
        const replacement = changedById.get(item.id);
        merged.push(replacement ?? item);
        presentIds.add(item.id);
    }
    for (const item of next) {
        if (changedById.has(item.id) && !presentIds.has(item.id)) {
            merged.push(item);
            presentIds.add(item.id);
        }
    }
    return merged;
}

export function createDefaultLibraryMigration(existingItems, seededVersion, materialize) {
    const normalizedVersion = Number.isInteger(seededVersion) && seededVersion >= 0 ? seededVersion : 0;
    if (normalizedVersion >= DEFAULT_LIBRARY_VERSION) return null;

    const libraryItems = Array.isArray(existingItems) ? [...existingItems] : [];
    const existingIds = new Set(libraryItems.map(({ id }) => id));
    let added = 0;
    for (const definition of defaultLibraryDefinitions) {
        if (definition.introducedIn <= normalizedVersion || existingIds.has(definition.id)) continue;
        libraryItems.push(materialize(definition));
        existingIds.add(definition.id);
        added += 1;
    }
    return { libraryItems, version: DEFAULT_LIBRARY_VERSION, added };
}
