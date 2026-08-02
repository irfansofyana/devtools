import { createQpdfRunner } from '../vendor/qpdf-run/0.2.1/src/index.js';

const MIN_PASSWORD_BYTES = 8;
const MAX_PASSWORD_BYTES = 127;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

export function validatePdfPassword(password, { requireMinimum = true } = {}) {
    const value = String(password ?? '');
    const byteLength = new TextEncoder().encode(value).byteLength;
    if (requireMinimum && byteLength < MIN_PASSWORD_BYTES) {
        throw new Error(`Use a password with at least ${MIN_PASSWORD_BYTES} UTF-8 bytes.`);
    }
    if (byteLength > MAX_PASSWORD_BYTES) {
        throw new Error(`Use a password no longer than ${MAX_PASSWORD_BYTES} UTF-8 bytes.`);
    }
    if (CONTROL_CHARACTERS.test(value)) {
        throw new Error('Passwords cannot contain control characters.');
    }
    return value;
}

async function withQpdf(operation) {
    const runner = await createQpdfRunner({
        timeoutMs: 60000,
        workerUrl: new URL('../vendor/qpdf-run/0.2.1/src/worker.js', import.meta.url).href,
        qpdfJsUrl: new URL('../vendor/qpdf-run/0.2.1/vendor/qpdf/lib/qpdf.js', import.meta.url).href,
        wasmUrl: new URL('../vendor/qpdf-run/0.2.1/vendor/qpdf/lib/qpdf.wasm', import.meta.url).href,
    });
    try {
        return await operation(runner);
    } finally {
        await runner.destroy();
    }
}

export async function lockPdf(bytes, password) {
    const secret = validatePdfPassword(password);
    try {
        return await withQpdf(async (runner) => {
            const encrypted = await runner.runOne({
                input: bytes,
                inputName: 'input.pdf',
                outputName: 'locked.pdf',
                args: [
                    '--password-mode=unicode',
                    '--encrypt',
                    `--user-password=${secret}`,
                    `--owner-password=${secret}`,
                    '--bits=256',
                    '--',
                    'input.pdf',
                    'locked.pdf',
                ],
            });
            await runner.runOne({
                input: encrypted,
                inputName: 'locked.pdf',
                outputName: 'verified.pdf',
                args: [`--password=${secret}`, '--decrypt', '--', 'locked.pdf', 'verified.pdf'],
            });
            return encrypted;
        });
    } catch {
        throw new Error('The PDF could not be encrypted. Check that it is a valid, unlocked PDF.');
    }
}

export async function unlockPdf(bytes, password) {
    const secret = validatePdfPassword(password, { requireMinimum: false });
    try {
        return await withQpdf((runner) => runner.runOne({
            input: bytes,
            inputName: 'input.pdf',
            outputName: 'unlocked.pdf',
            args: [`--password=${secret}`, '--decrypt', '--', 'input.pdf', 'unlocked.pdf'],
        }));
    } catch {
        throw new Error('The PDF could not be unlocked. Check the password and encryption format.');
    }
}
