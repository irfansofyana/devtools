export function createSerializedDeltaQueue({ initialValue, persist }) {
    if (typeof persist !== 'function') throw new TypeError('A persistence function is required.');
    let baseline = structuredClone(initialValue);
    let tail = Promise.resolve(structuredClone(baseline));

    return {
        enqueue(nextValue) {
            const desired = structuredClone(nextValue);
            const operation = tail
                .catch(() => undefined)
                .then(async () => {
                    const previous = structuredClone(baseline);
                    const persisted = await persist(previous, desired);
                    baseline = structuredClone(desired);
                    return structuredClone(persisted ?? desired);
                });
            tail = operation;
            return operation;
        },
        flush() {
            return tail.then((value) => structuredClone(value));
        },
        getBaseline() {
            return structuredClone(baseline);
        },
        setBaseline(value) {
            baseline = structuredClone(value);
        },
    };
}

export async function refreshCommittedLibraryView({ queue, committedItems, suppressionRef, refresh }) {
    const previousBaseline = queue.getBaseline();
    queue.setBaseline(committedItems);
    suppressionRef.current += 1;
    try {
        await refresh();
    } catch (error) {
        queue.setBaseline(previousBaseline);
        throw error;
    } finally {
        suppressionRef.current -= 1;
    }
}

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
