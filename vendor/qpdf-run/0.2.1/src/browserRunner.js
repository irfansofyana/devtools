import { createQpdfRunError, toUint8Array } from './bytes.js';

export async function createBrowserQpdfRunner(options) {
  options = options || {};

  var assetBaseUrl = options.assetBaseUrl ? resolveUrl(options.assetBaseUrl) : null;
  var qpdfJsUrl = resolveUrl(options.qpdfJsUrl || (assetBaseUrl ? joinBaseUrl(assetBaseUrl, 'lib/qpdf.js') : new URL('../vendor/qpdf/lib/qpdf.js', import.meta.url).href));
  var wasmUrl = resolveUrl(options.wasmUrl || (assetBaseUrl ? joinBaseUrl(assetBaseUrl, 'lib/qpdf.wasm') : new URL('../vendor/qpdf/lib/qpdf.wasm', import.meta.url).href));
  var workerUrl = options.workerUrl || new URL('./worker.js', import.meta.url).href;
  var timeoutMs = Number.isFinite(Number(options.timeoutMs)) ? Number(options.timeoutMs) : 20000;
  var worker = createWorker(workerUrl);
  var nextId = 1;
  var pending = new Map();
  var destroyed = false;

  worker.onmessage = function(event) {
    var message = event.data || {};
    var entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    clearTimeout(entry.timer);
    if (message.ok) {
      entry.resolve(message);
    } else {
      entry.reject(createQpdfRunError(message.code || 'QPDF_EXEC_FAILED', message.message || 'qpdf failed', message));
    }
  };

  worker.onerror = function(error) {
    pending.forEach(function(entry) {
      clearTimeout(entry.timer);
      entry.reject(createQpdfRunError('QPDF_EXEC_FAILED', error && error.message || 'qpdf worker failed.'));
    });
    pending.clear();
  };

  try {
    await sendWorkerMessage({
      type: 'init',
      qpdfJsUrl: qpdfJsUrl,
      wasmUrl: wasmUrl
    });
  } catch (error) {
    destroyed = true;
    pending.forEach(function(entry) {
      clearTimeout(entry.timer);
      entry.reject(createQpdfRunError('QPDF_INIT_FAILED', 'QPDF worker initialization failed.'));
    });
    pending.clear();
    worker.terminate();
    throw error;
  }

  return {
    async run(runOptions) {
      if (destroyed) {
        throw createQpdfRunError('QPDF_EXEC_FAILED', 'QPDF runner has been destroyed.');
      }
      validateRunOptions(runOptions);
      return await sendWorkerMessage(makeRunMessage(runOptions));
    },

    async runOne(runOptions) {
      runOptions = runOptions || {};
      var outputName = runOptions.outputName || 'output.pdf';
      var result = await this.run({
        inputs: {
          [runOptions.inputName || 'input.pdf']: runOptions.input
        },
        args: runOptions.args,
        outputs: [outputName]
      });
      return result.outputs[outputName];
    },

    async destroy() {
      destroyed = true;
      pending.forEach(function(entry) {
        clearTimeout(entry.timer);
        entry.reject(createQpdfRunError('QPDF_EXEC_FAILED', 'QPDF runner has been destroyed.'));
      });
      pending.clear();
      worker.postMessage({ type: 'destroy' });
      worker.terminate();
    }
  };

  function sendWorkerMessage(message) {
    var id = String(nextId++);
    var transfer = getTransferList(message);
    message.id = id;

    return new Promise(function(resolve, reject) {
      var timer = setTimeout(function() {
        pending.delete(id);
        reject(createQpdfRunError('QPDF_TIMEOUT', 'QPDF worker timed out.'));
      }, timeoutMs);

      pending.set(id, { resolve: resolve, reject: reject, timer: timer });
      worker.postMessage(message, transfer);
    });
  }
}

function validateRunOptions(options) {
  if (!options.inputs || !Object.keys(options.inputs).length) {
    throw createQpdfRunError('QPDF_INVALID_INPUT', 'qpdf.run requires at least one input file.');
  }
  if (!Array.isArray(options.args) || !options.args.length) {
    throw createQpdfRunError('QPDF_INVALID_INPUT', 'qpdf.run requires args.');
  }
  if (!Array.isArray(options.outputs) || !options.outputs.length) {
    throw createQpdfRunError('QPDF_INVALID_INPUT', 'qpdf.run requires at least one output name.');
  }
}

function makeRunMessage(options) {
  var inputs = {};
  Object.keys(options.inputs || {}).forEach(function(name) {
    inputs[name] = toUint8Array(options.inputs[name]);
  });
  return {
    type: 'run',
    inputs: inputs,
    args: options.args.slice(),
    outputs: options.outputs.slice()
  };
}

function getTransferList(message) {
  var transfer = [];
  if (message.inputs) {
    Object.keys(message.inputs).forEach(function(name) {
      transfer.push(message.inputs[name].buffer);
    });
  }
  return transfer;
}

function createWorker(workerUrl) {
  if (typeof Worker === 'undefined') {
    throw createQpdfRunError('QPDF_INIT_FAILED', 'Web Worker is unavailable in this environment.');
  }
  return new Worker(workerUrl);
}

function joinBaseUrl(baseUrl, path) {
  return String(baseUrl || '').replace(/\/?$/, '/') + path;
}

function resolveUrl(url) {
  return new URL(String(url || ''), import.meta.url).href;
}
