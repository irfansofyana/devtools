export { toUint8Array, toArrayBuffer } from './bytes.js';
export { createBrowserQpdfRunner } from './browserRunner.js';

export async function createQpdfRunner(options) {
  options = options || {};

  if (options.env && options.env !== 'browser') {
    throw new Error('qpdf-run currently supports only env: "browser".');
  }

  var module = await import('./browserRunner.js');
  return await module.createBrowserQpdfRunner(options);
}
