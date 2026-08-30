import init, {
    formatFromBytes,
    formatFromPath,
    toMarkdownBytes,
} from '../vendor/anydoc/0.2.4/anydoc_wasm.mjs';

let initialized = false;

function serializeError(error) {
    return {
        message: error instanceof Error ? error.message : String(error),
        code: typeof error?.code === 'string' ? error.code : 'unknown',
        pages: Array.isArray(error?.pages) ? error.pages : [],
        pageCount: Number.isFinite(error?.pageCount) ? error.pageCount : undefined,
    };
}

self.addEventListener('message', async ({ data }) => {
    if (data?.type !== 'convert') return;
    try {
        if (!initialized) {
            await init();
            initialized = true;
        }
        const bytes = new Uint8Array(data.buffer);
        const detectedFormat = formatFromBytes(bytes);
        const fallbackFormat = formatFromPath(data.name || '');
        const format = detectedFormat || fallbackFormat;
        const startedAt = performance.now();
        const markdown = toMarkdownBytes(bytes, format);
        self.postMessage({
            ok: true,
            result: {
                markdown,
                format: format || 'unknown',
                processingTimeMs: performance.now() - startedAt,
            },
        });
    } catch (error) {
        self.postMessage({ ok: false, error: serializeError(error) });
    }
});
