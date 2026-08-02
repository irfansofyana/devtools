import {
    cleanPdfMetadata,
    createPdfFromImages,
    extractPdfPages,
    getPdfPageCount,
    mergePdfDocuments,
    organizePdfPages,
    stampPdf,
} from './pdf-engine.mjs';

self.addEventListener('message', async ({ data }) => {
    if (data?.type !== 'run') return;
    try {
        const payload = data.payload || {};
        let output;
        if (data.mode === 'count') output = await getPdfPageCount(payload.bytes);
        else if (data.mode === 'merge') output = await mergePdfDocuments(payload.documents);
        else if (data.mode === 'extract') output = await extractPdfPages(payload.bytes, payload.pageIndices);
        else if (data.mode === 'organize') output = await organizePdfPages(payload.bytes, payload.pageOrder, payload.rotations);
        else if (data.mode === 'images') output = await createPdfFromImages(payload.images, payload.options);
        else if (data.mode === 'metadata') output = await cleanPdfMetadata(payload.bytes);
        else if (data.mode === 'watermark') output = await stampPdf(payload.bytes, payload.options);
        else throw new Error(`Unknown PDF worker mode: ${data.mode}`);

        if (output instanceof Uint8Array) {
            self.postMessage({ ok: true, output }, [output.buffer]);
        } else {
            self.postMessage({ ok: true, output });
        }
    } catch (error) {
        self.postMessage({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
        });
    }
});
