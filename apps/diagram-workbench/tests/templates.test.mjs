import assert from 'node:assert/strict';
import test from 'node:test';

import { getTemplate, templateCatalog, validateTemplate } from '../src/domain/templates.js';

test('technical template catalog ships distinct, internally valid starter scenes', () => {
    assert.ok(templateCatalog.length >= 8);
    assert.equal(new Set(templateCatalog.map(({ id }) => id)).size, templateCatalog.length);

    for (const template of templateCatalog) {
        assert.equal(validateTemplate(template), true, template.id);
        assert.ok(template.nodes.length >= 3, `${template.id} needs a useful starting structure`);
    }
});

test('template lookup returns an isolated copy and rejects unknown ids', () => {
    const first = getTemplate('scalable-web-app');
    first.nodes[0].label = 'changed';
    assert.notEqual(getTemplate('scalable-web-app').nodes[0].label, 'changed');
    assert.throws(() => getTemplate('missing-template'), /Unknown template/);
});
