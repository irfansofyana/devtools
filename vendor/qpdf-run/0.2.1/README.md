# qpdf-run

`qpdf-run` is a browser-only JavaScript wrapper for running qpdf WASM with a clean `Uint8Array` input/output API.

It solves the common browser integration problem around qpdf WASM: pass PDF bytes in, run normal qpdf command arguments, and get PDF bytes back without touching Emscripten `FS.writeFile()`, `callMain()`, or `FS.readFile()` directly.

The package boundary is intentionally narrow:

- run qpdf in the browser through a Web Worker
- accept `Uint8Array`, `ArrayBuffer`, or typed-array inputs
- run regular qpdf CLI-style arguments
- support multiple input and output files per command
- return output files as `Uint8Array`
- capture stdout, stderr, warnings, exit code, and duration
- clean temporary MEMFS files between runs
- keep PDF editing and document semantics out of this package

Current support:

- Browser: supported through a Web Worker and qpdf WASM
- Node.js: not supported in this release

## Install

```bash
npm install qpdf-run
```

The package ships plain ESM JavaScript, TypeScript declarations, and the vendored qpdf WASM runtime.

It is useful when you want this:

```js
const output = await qpdf.runOne({
  input: pdfBytes,
  inputName: 'input.pdf',
  outputName: 'output.pdf',
  args: ['--linearize', '--', 'input.pdf', 'output.pdf']
});
```

instead of wiring qpdf WASM manually:

```js
qpdf.FS.writeFile('/input.pdf', pdfBytes);
qpdf.callMain(['--linearize', '--', '/input.pdf', '/output.pdf']);
const output = qpdf.FS.readFile('/output.pdf');
```

Included pieces:

- `src/index.js`: public ESM entrypoint
- `src/browserRunner.js`: browser runner API
- `src/worker.js`: qpdf-run browser worker
- `src/index.d.ts`: TypeScript declarations
- `vendor/qpdf/`: vendored qpdf WASM runtime
- `examples/browser/index.html`: manual browser demo
- `examples/browser/smoke.html`: automated browser smoke page

Bundler-safe asset subpaths:

- `qpdf-run/worker`: browser worker script
- `qpdf-run/qpdf.js`: Emscripten qpdf JavaScript runtime
- `qpdf-run/qpdf.wasm`: qpdf WASM binary

## API

### `run()`

```js
import { createQpdfRunner } from 'qpdf-run';

const qpdf = await createQpdfRunner({
  assetBaseUrl: '/qpdf/'
});

try {
  const result = await qpdf.run({
    inputs: {
      'input.pdf': pdfBytes
    },
    args: [
      '--qdf',
      '--object-streams=disable',
      '--decode-level=all',
      '--',
      'input.pdf',
      'output.qdf.pdf'
    ],
    outputs: ['output.qdf.pdf']
  });

  const outputBytes = result.outputs['output.qdf.pdf'];
} finally {
  await qpdf.destroy();
}
```

### `runOne()`

For a single input and output:

```js
const output = await qpdf.runOne({
  input: pdfBytes,
  inputName: 'input.pdf',
  outputName: 'output.pdf',
  args: ['--linearize', '--', 'input.pdf', 'output.pdf']
});
```

### Common Commands

Convert to QDF:

```js
const qdf = await qpdf.runOne({
  input: pdfBytes,
  inputName: 'input.pdf',
  outputName: 'output.qdf.pdf',
  args: ['--qdf', '--object-streams=disable', '--decode-level=all', '--', 'input.pdf', 'output.qdf.pdf']
});
```

Optimize for web:

```js
const linearized = await qpdf.runOne({
  input: pdfBytes,
  inputName: 'input.pdf',
  outputName: 'linearized.pdf',
  args: ['--linearize', '--', 'input.pdf', 'linearized.pdf']
});
```

## Runner Options

`createQpdfRunner()` accepts:

- `assetBaseUrl`: base URL for `vendor/qpdf/`; used to resolve `lib/qpdf.js` and `lib/qpdf.wasm`
- `qpdfJsUrl`: explicit URL for the Emscripten qpdf JavaScript runtime
- `wasmUrl`: explicit URL for `qpdf.wasm`
- `workerUrl`: explicit URL for `src/worker.js`
- `timeoutMs`: worker request timeout; defaults to `20000`
- `env`: currently only `'browser'`

When a host app uses a bundler, prefer resolving explicit URLs through the package exports:

```js
const workerUrl = new URL('qpdf-run/worker', import.meta.url).href;
const qpdfJsUrl = new URL('qpdf-run/qpdf.js', import.meta.url).href;
const wasmUrl = new URL('qpdf-run/qpdf.wasm', import.meta.url).href;

const qpdf = await createQpdfRunner({ workerUrl, qpdfJsUrl, wasmUrl });
```

## Results And Errors

`run()` resolves with:

```ts
type QpdfRunResult = {
  ok: boolean;
  outputs: Record<string, Uint8Array>;
  stdout: string[];
  stderr: string[];
  warnings: string[];
  exitCode: number | null;
  durationMs: number;
};
```

Failures throw `QpdfRunError` with one of:

- `QPDF_INIT_FAILED`
- `QPDF_TIMEOUT`
- `QPDF_EXEC_FAILED`
- `QPDF_OUTPUT_MISSING`
- `QPDF_INVALID_INPUT`

## Browser Smoke

The automated browser smoke test starts a local static server, launches headless Chrome, runs qpdf twice, and verifies that a missing requested output throws `QPDF_OUTPUT_MISSING`.

```bash
npm run check
npm run smoke:browser
```

If Chrome is not available as `google-chrome`, set:

```bash
CHROME_BIN=/path/to/chrome npm run smoke:browser
```

## Browser Demo

Start the static server:

```bash
npm run serve
```

Then open:

```text
http://127.0.0.1:8080/
```

The root page redirects to the manual demo at `/examples/browser/index.html`. The demo lets you choose a PDF, run QDF conversion or web optimization, and download the generated PDF.

## Buffer Ownership

Input bytes are copied before they are transferred to the worker. Output bytes returned from the worker are clean `Uint8Array` copies, not over-allocated MEMFS views.

## Non-Goals

This package will not parse PDF text streams, patch text operators, match rendered text items, handle font fallback, perform whiteout/redraw logic, or implement semantic PDF editing. Those belong in a higher-level package.
