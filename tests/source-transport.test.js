// Copyright 2025 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import { Bag } from '@jsr/genro__bag';
import { BuilderBase, SourceBag, SourceBagNode,
    sourceBagFromTytx, sourceBagToTytx, wrapSource } from '../src/index.js';
import { declaration, grammarDocument } from './grammar-fixture.js';

class SourceBuilder extends BuilderBase {
    static _name = 'test'; static _defaultRenderMode = 'object';
    static { this.defineGrammar(grammarDocument('source-test', {
        box: declaration({ sub_tags: '*' }), leaf: declaration({ sub_tags: '' }),
    })); }
    main() {}
}
function tagged(bag, label, tag, value = null, attr = {}) {
    return bag.setItem(label, value, attr, '>', false, true, null, false, true, null, tag);
}

for (const transport of ['json', 'msgpack']) {
    test(`registered SourceBag TYTX preserves root, branches, nodeTag and scalars (${transport})`, () => {
        const source = new SourceBag(); const children = new SourceBag();
        tagged(children, 'leaf_0', 'leaf', 'hello', { role: 'note' });
        tagged(source, 'box_0', 'box', children, { title: 'box' });
        tagged(source, 'data_0', 'leaf', new Bag({ value: 42 }));
        const builder = new SourceBuilder();
        const options = { transport };
        const result = sourceBagFromTytx(sourceBagToTytx(source, options), builder, options);
        assert.ok(result instanceof SourceBag); assert.ok(result.node('box_0') instanceof SourceBagNode);
        assert.ok(result.getItem('box_0') instanceof SourceBag);
        assert.equal(result.node('box_0').nodeTag, 'box');
        assert.equal(result.getItem('box_0').node('leaf_0').nodeTag, 'leaf');
        assert.equal(result.getItem('box_0.leaf_0'), 'hello');
        assert.equal(result.getItem('data_0').constructor, Bag);
        assert.equal(result._builder, builder); assert.equal(result.getItem('box_0')._builder, builder);
    });
}

test('bindBuilder rejects shared SourceBag graphs before changing ownership', () => {
    const original = new SourceBuilder(); const replacement = new SourceBuilder();
    const source = new SourceBag(null, original); const shared = new SourceBag(null, original);
    tagged(source, 'left', 'box', shared); tagged(source, 'right', 'box', shared);
    assert.throws(() => source.bindBuilder(replacement), /cyclic or shared SourceBag branch/);
    assert.equal(source._builder, original); assert.equal(shared._builder, original);
});

test('builder insertion exposes nodeTag and builder in the single insert event', () => {
    const builder = new SourceBuilder(); builder.source.setBackref(); const observed = [];
    builder.source.subscribe('atomic', { insert(event) { observed.push([event.node.nodeTag, event.node.builder]); } });
    const node = wrapSource(builder.source).leaf('value');
    assert.equal(node.nodeTag, 'leaf'); assert.deepEqual(observed, [['leaf', builder]]);
});

test('fluent handles have stable identity and expose an explicit raw target', async () => {
    const { sourceTarget } = await import('../src/index.js');
    const builder = new SourceBuilder();
    assert.equal(builder.root, builder.root);
    const child = builder.root.box();
    assert.equal(builder.wrapSource(sourceTarget(child)), child);
    assert.equal(sourceTarget(child).nodeTag, 'box');
});

test('the generic package has no recipe or convenience-only APIs', async () => {
    const api = await import('../src/index.js');
    const builder = new SourceBuilder();
    assert.equal('RecipeExpander' in api, false);
    for (const name of ['recipe', 'setData', 'attachSource']) assert.equal(name in builder, false);
    assert.equal(builder.schema.recipe, undefined);
    assert.equal(builder.root.recipe, undefined);
    assert.equal(builder.root.box().recipe, undefined);
});

test('renderer exposes the Python traversal without alternative access hooks', async () => {
    const {RendererBase} = await import('../src/index.js');
    for (const name of ['prepareItem', 'builderFor', 'metaFor', 'tagFor', 'attrFor', 'runtimeValues']) {
        assert.equal(name in RendererBase.prototype, false);
    }
});
