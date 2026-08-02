function node(id, label, x, y, kind = 'service') {
    return { id, label, x, y, width: 190, height: 80, kind };
}

function edge(from, to, label = '') {
    return { from, to, label };
}

export const templateCatalog = [
    {
        id: 'scalable-web-app',
        name: 'Scalable web application',
        category: 'System design',
        description: 'Clients, edge delivery, horizontally scaled services, cache, queue, and database.',
        nodes: [
            node('clients', 'Web + mobile clients', 0, 180, 'client'),
            node('cdn', 'CDN / edge', 280, 60, 'network'),
            node('lb', 'Load balancer', 280, 300, 'network'),
            node('api-a', 'API service A', 580, 180),
            node('api-b', 'API service B', 580, 330),
            node('cache', 'Cache', 880, 60, 'data'),
            node('queue', 'Message queue', 880, 230, 'event'),
            node('db', 'Primary database', 880, 400, 'data'),
        ],
        edges: [
            edge('clients', 'cdn'), edge('cdn', 'lb'), edge('lb', 'api-a'), edge('lb', 'api-b'),
            edge('api-a', 'cache'), edge('api-b', 'cache'), edge('api-a', 'queue'), edge('api-b', 'queue'),
            edge('api-a', 'db'), edge('api-b', 'db'),
        ],
    },
    {
        id: 'event-driven-microservices',
        name: 'Event-driven microservices',
        category: 'System design',
        description: 'An event bus connecting producers, consumers, data stores, and observability.',
        nodes: [
            node('producer-a', 'Order service', 0, 80), node('producer-b', 'Billing service', 0, 260),
            node('bus', 'Event bus', 340, 170, 'event'), node('consumer-a', 'Fulfilment worker', 690, 40),
            node('consumer-b', 'Notification worker', 690, 200), node('consumer-c', 'Analytics consumer', 690, 360),
            node('store', 'Event store', 1030, 100, 'data'), node('observability', 'Logs + metrics', 1030, 310, 'ops'),
        ],
        edges: [
            edge('producer-a', 'bus', 'publishes'), edge('producer-b', 'bus', 'publishes'),
            edge('bus', 'consumer-a'), edge('bus', 'consumer-b'), edge('bus', 'consumer-c'),
            edge('consumer-a', 'store'), edge('consumer-c', 'store'), edge('consumer-a', 'observability'),
            edge('consumer-b', 'observability'), edge('consumer-c', 'observability'),
        ],
    },
    {
        id: 'kubernetes-application',
        name: 'Kubernetes application',
        category: 'Infrastructure',
        description: 'Ingress, services, deployments, stateful workloads, configuration, and monitoring.',
        nodes: [
            node('users', 'Users', 0, 200, 'client'), node('ingress', 'Ingress controller', 270, 200, 'network'),
            node('web-svc', 'Web service', 560, 80), node('api-svc', 'API service', 560, 240),
            node('worker', 'Worker deployment', 560, 400), node('config', 'Config + secrets', 850, 20, 'ops'),
            node('database', 'Stateful database', 850, 210, 'data'), node('monitoring', 'Monitoring', 850, 400, 'ops'),
        ],
        edges: [
            edge('users', 'ingress'), edge('ingress', 'web-svc'), edge('ingress', 'api-svc'),
            edge('api-svc', 'worker'), edge('api-svc', 'database'), edge('worker', 'database'),
            edge('config', 'web-svc'), edge('config', 'api-svc'), edge('web-svc', 'monitoring'),
            edge('api-svc', 'monitoring'), edge('worker', 'monitoring'),
        ],
    },
    {
        id: 'serverless-application',
        name: 'Serverless application',
        category: 'Cloud',
        description: 'Edge delivery, API functions, events, object storage, database, and monitoring.',
        nodes: [
            node('client', 'Client', 0, 190, 'client'), node('edge', 'CDN + static hosting', 260, 80, 'network'),
            node('gateway', 'API gateway', 260, 300, 'network'), node('function', 'Application function', 570, 190),
            node('events', 'Event queue', 570, 390, 'event'), node('database', 'Managed database', 880, 80, 'data'),
            node('storage', 'Object storage', 880, 250, 'data'), node('monitoring', 'Logs + traces', 880, 420, 'ops'),
        ],
        edges: [
            edge('client', 'edge'), edge('client', 'gateway'), edge('gateway', 'function'),
            edge('function', 'database'), edge('function', 'storage'), edge('function', 'events'),
            edge('events', 'function', 'triggers'), edge('function', 'monitoring'),
        ],
    },
    {
        id: 'data-pipeline',
        name: 'Data ingestion pipeline',
        category: 'Data',
        description: 'Sources, ingestion, stream and batch processing, storage, warehouse, and consumers.',
        nodes: [
            node('sources', 'Applications + devices', 0, 180, 'client'), node('ingest', 'Ingestion gateway', 260, 180, 'network'),
            node('stream', 'Event stream', 540, 60, 'event'), node('batch', 'Batch landing zone', 540, 300, 'data'),
            node('processor', 'Stream processor', 820, 60), node('etl', 'ETL jobs', 820, 300),
            node('lake', 'Data lake', 1100, 180, 'data'), node('warehouse', 'Warehouse', 1380, 180, 'data'),
            node('consumers', 'BI + ML consumers', 1660, 180, 'client'),
        ],
        edges: [
            edge('sources', 'ingest'), edge('ingest', 'stream'), edge('ingest', 'batch'),
            edge('stream', 'processor'), edge('batch', 'etl'), edge('processor', 'lake'), edge('etl', 'lake'),
            edge('lake', 'warehouse'), edge('warehouse', 'consumers'),
        ],
    },
    {
        id: 'authentication-flow',
        name: 'Authentication flow',
        category: 'Security',
        description: 'Client, application, identity provider, token validation, session, and protected API.',
        nodes: [
            node('user', 'User', 0, 170, 'client'), node('app', 'Web application', 260, 170),
            node('idp', 'Identity provider', 560, 30, 'external'), node('callback', 'Auth callback', 560, 220),
            node('session', 'Session store', 860, 30, 'data'), node('api', 'Protected API', 860, 220),
            node('audit', 'Audit log', 1160, 220, 'ops'),
        ],
        edges: [
            edge('user', 'app', 'sign in'), edge('app', 'idp', 'authorize'), edge('idp', 'callback', 'code'),
            edge('callback', 'idp', 'exchange'), edge('callback', 'session'), edge('app', 'api', 'session/token'),
            edge('api', 'session', 'validate'), edge('api', 'audit'),
        ],
    },
    {
        id: 'ci-cd-pipeline',
        name: 'CI/CD pipeline',
        category: 'Delivery',
        description: 'Source, build, test, security, artifact, staged deployment, and observability.',
        nodes: [
            node('source', 'Git repository', 0, 170, 'code'), node('build', 'Build', 250, 170, 'ops'),
            node('tests', 'Automated tests', 500, 70, 'ops'), node('security', 'Security checks', 500, 270, 'ops'),
            node('artifact', 'Artifact registry', 780, 170, 'data'), node('staging', 'Staging', 1060, 70),
            node('production', 'Production', 1060, 270), node('observe', 'Observability', 1340, 170, 'ops'),
        ],
        edges: [
            edge('source', 'build'), edge('build', 'tests'), edge('build', 'security'),
            edge('tests', 'artifact'), edge('security', 'artifact'), edge('artifact', 'staging'),
            edge('staging', 'production', 'approval'), edge('staging', 'observe'), edge('production', 'observe'),
        ],
    },
    {
        id: 'c4-system-context',
        name: 'C4 system context',
        category: 'C4',
        description: 'People, the system of interest, external systems, and labeled relationships.',
        nodes: [
            node('customer', 'Customer\n[Person]', 0, 80, 'person'), node('operator', 'Operations team\n[Person]', 0, 310, 'person'),
            node('system', 'Product platform\n[Software system]', 390, 190, 'system'),
            node('payments', 'Payment provider\n[External system]', 800, 40, 'external'),
            node('identity', 'Identity provider\n[External system]', 800, 220, 'external'),
            node('analytics', 'Analytics platform\n[External system]', 800, 400, 'external'),
        ],
        edges: [
            edge('customer', 'system', 'uses'), edge('operator', 'system', 'operates'),
            edge('system', 'payments', 'charges through'), edge('system', 'identity', 'authenticates with'),
            edge('system', 'analytics', 'sends events to'),
        ],
    },
];

export function validateTemplate(template) {
    if (!template?.id || !template?.name || !Array.isArray(template.nodes) || !Array.isArray(template.edges)) return false;
    const nodeIds = new Set(template.nodes.map(({ id }) => id));
    if (nodeIds.size !== template.nodes.length || template.nodes.some(({ id, label }) => !id || !label)) return false;
    return template.edges.every(({ from, to }) => nodeIds.has(from) && nodeIds.has(to) && from !== to);
}

export function getTemplate(id) {
    const template = templateCatalog.find((candidate) => candidate.id === id);
    if (!template) throw new Error(`Unknown template: ${id}`);
    return structuredClone(template);
}
