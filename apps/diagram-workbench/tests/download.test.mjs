import assert from 'node:assert/strict';
import test from 'node:test';

import { safeFilename } from '../src/utils/download.js';

test('export filenames are bounded, normalized, and keep the requested extension', () => {
    assert.equal(safeFilename('  API / Payment Flow  ', 'excalidraw'), 'api-payment-flow.excalidraw');
    assert.equal(safeFilename('', 'png'), 'diagram.png');
    assert.ok(safeFilename('x'.repeat(200), 'svg').length <= 84);
});
