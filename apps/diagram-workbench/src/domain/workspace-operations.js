export function createWorkspaceOperationCoordinator({ onStart = () => {}, onFinish = () => {} } = {}) {
    let active = false;
    let token = 0;

    return {
        isActive: () => active,
        currentToken: () => token,
        async run(label, operation) {
            if (active) return { accepted: false };
            active = true;
            token += 1;
            const operationToken = token;
            onStart(label, operationToken);
            try {
                const value = await operation(operationToken);
                return { accepted: true, token: operationToken, value };
            } finally {
                active = false;
                onFinish(label, operationToken);
            }
        },
    };
}
