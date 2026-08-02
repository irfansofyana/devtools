export type QpdfInputBytes = Uint8Array | ArrayBuffer | ArrayBufferView;

export type QpdfRunErrorCode =
  | 'QPDF_INIT_FAILED'
  | 'QPDF_TIMEOUT'
  | 'QPDF_EXEC_FAILED'
  | 'QPDF_OUTPUT_MISSING'
  | 'QPDF_INVALID_INPUT';

export interface QpdfRunnerOptions {
  /**
   * Base URL for the vendored qpdf browser assets. Used to resolve
   * lib/qpdf.js and lib/qpdf.wasm when explicit URLs are not supplied.
   */
  assetBaseUrl?: string | URL;
  /** Explicit URL for the Emscripten qpdf JavaScript runtime. */
  qpdfJsUrl?: string | URL;
  /** Explicit URL for qpdf.wasm. */
  wasmUrl?: string | URL;
  /** Explicit URL for qpdf-run's browser worker. */
  workerUrl?: string | URL;
  /** Worker request timeout in milliseconds. Defaults to 20000. */
  timeoutMs?: number;
  /** qpdf-run currently supports only browser execution. */
  env?: 'browser';
}

export interface QpdfRunOptions {
  inputs: Record<string, QpdfInputBytes>;
  args: string[];
  outputs: string[];
}

export interface QpdfRunOneOptions {
  input: QpdfInputBytes;
  inputName?: string;
  outputName?: string;
  args: string[];
}

export interface QpdfRunResult {
  ok: boolean;
  outputs: Record<string, Uint8Array>;
  stdout: string[];
  stderr: string[];
  warnings: string[];
  exitCode: number | null;
  durationMs: number;
}

export interface QpdfRunError extends Error {
  name: 'QpdfRunError';
  code: QpdfRunErrorCode;
  stdout?: string[];
  stderr?: string[];
  exitCode?: number | null;
}

export interface QpdfRunner {
  run(options: QpdfRunOptions): Promise<QpdfRunResult>;
  runOne(options: QpdfRunOneOptions): Promise<Uint8Array>;
  destroy(): Promise<void>;
}

export function createQpdfRunner(options?: QpdfRunnerOptions): Promise<QpdfRunner>;
export function createBrowserQpdfRunner(options?: QpdfRunnerOptions): Promise<QpdfRunner>;
export function toUint8Array(bytes: QpdfInputBytes): Uint8Array;
export function toArrayBuffer(bytes: QpdfInputBytes): ArrayBuffer;
