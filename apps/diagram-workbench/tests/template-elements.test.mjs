import assert from 'node:assert/strict';
import test from 'node:test';

import { templateToSkeletons } from '../src/domain/template-elements.js';
import { getTemplate, templateCatalog, validateTemplate } from '../src/domain/templates.js';

test('template scenes convert into labeled bound shapes and arrows', () => {
    const template = getTemplate('authentication-flow');
    const skeletons = templateToSkeletons(template);
    const shapes = skeletons.filter(({ type }) => type === 'rectangle' || type === 'ellipse');
    const arrows = skeletons.filter(({ type }) => type === 'arrow');

    assert.equal(shapes.length, template.nodes.length);
    assert.equal(arrows.length, template.edges.length);
    assert.ok(shapes.every(({ id, label }) => id && label?.text));
    assert.ok(arrows.every(({ start, end, points }) => start?.id && end?.id && points?.length === 2));
    assert.ok(arrows.some(({ label }) => label?.text === 'authorize'));

    const nodesByElementId = new Map(template.nodes.map((node) => [`template-${template.id}-${node.id}`, node]));
    for (const arrow of arrows) {
        const start = nodesByElementId.get(arrow.start.id);
        const end = nodesByElementId.get(arrow.end.id);
        const endpoint = arrow.points.at(-1);
        const globalEnd = { x: arrow.x + endpoint[0], y: arrow.y + endpoint[1] };
        const startCenter = { x: start.x + start.width / 2, y: start.y + start.height / 2 };
        const endCenter = { x: end.x + end.width / 2, y: end.y + end.height / 2 };
        assert.ok(Math.hypot(arrow.x - startCenter.x, arrow.y - startCenter.y) <= Math.hypot(start.width / 2, start.height / 2) + 15);
        assert.ok(Math.hypot(globalEnd.x - endCenter.x, globalEnd.y - endCenter.y) <= Math.hypot(end.width / 2, end.height / 2) + 15);
    }
    assert.ok(new Set(arrows.map(({ x, y, points }) => `${x}:${y}:${points.at(-1).join(':')}`)).size > 1);
});

test('planning catalog includes editable Miro-lite boards with valid pastel elements', () => {
    const expected = ['brainstorm', 'mind-map', 'kanban-board', 'retrospective', 'user-journey'];
    assert.deepEqual(expected.filter((id) => !templateCatalog.some((template) => template.id === id)), []);
    assert.ok(templateCatalog.every(validateTemplate));

    for (const id of expected) {
        const template = getTemplate(id);
        assert.equal(template.category, 'Planning');
        assert.ok(template.nodes.length >= 5, id);
        const skeletons = templateToSkeletons(template);
        const shapes = skeletons.filter(({ type }) => ['rectangle', 'ellipse', 'diamond'].includes(type));
        assert.equal(shapes.length, template.nodes.length);
        assert.ok(new Set(shapes.map(({ backgroundColor }) => backgroundColor)).size >= 2, id);
    }
});
