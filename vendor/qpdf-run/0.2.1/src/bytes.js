export function toUint8Array(bytes) {
  if (bytes instanceof Uint8Array) {
    return new Uint8Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  }

  if (bytes instanceof ArrayBuffer) {
    return new Uint8Array(bytes.slice(0));
  }

  if (ArrayBuffer.isView(bytes)) {
    return new Uint8Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  }

  throw createQpdfRunError('QPDF_INVALID_INPUT', 'Expected Uint8Array, ArrayBuffer, or typed-array input.');
}

export function toArrayBuffer(bytes) {
  return toUint8Array(bytes).buffer;
}

export function copyOutputBytes(bytes) {
  return toUint8Array(bytes);
}

export function createQpdfRunError(code, message, detail) {
  var error = new Error(message);
  error.name = 'QpdfRunError';
  error.code = code;
  if (detail) {
    error.stdout = detail.stdout;
    error.stderr = detail.stderr;
    error.exitCode = detail.exitCode;
  }
  return error;
}
