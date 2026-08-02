import init, { processPdf } from '../vendor/pdf-inspector/0.1.3/pdf_inspector_wasm.mjs';

let initialized = false;

self.addEventListener('message', async ({ data }) => {
    if (data?.type !== 'inspect') return;
    try {
        if (!initialized) {
            await init();
            initialized = true;
        }
        const result = processPdf(new Uint8Array(data.buffer), {
            password: data.password || undefined,
            pages: data.pages?.length ? data.pages : undefined,
            profile: data.profile === 'compact' ? 'compact' : 'fidelity',
            includePageMarkers: Boolean(data.includePageMarkers),
        });
        self.postMessage({ ok: true, result });
    } catch (error) {
        self.postMessage({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
        });
    }
});
