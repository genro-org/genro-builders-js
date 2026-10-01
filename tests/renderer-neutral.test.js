// Copyright 2025 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import { Bag } from '@genrojs/bag';
import {
    BuilderBase, RendererBase, SourceBag, wrapSource,
} from '../src/index.js';
import { abstractDeclaration, declaration, grammarDocument } from './grammar-fixture.js';

class ObjectRenderer extends RendererBase {
    static renderType = 'object';
    static mode = 'object';
    renderedItem(_node, item, attrs, { tag }) { return { tag, attrs, item }; }
    finalize(result, target) {
        const output = { values: Array.isArray(result) ? result : [result] };
        if (target) { target.full(output); return null; }
        return output;
    }
}

class TestBuilder extends BuilderBase {
    static _name = 'test'; static _defaultRenderMode = 'object';
    static containers = ['card'];
    static components = ['badge'];
    static { this.defineGrammar(grammarDocument('renderer-neutral', {
        box: declaration({ inherits_from: 'content', _meta: { role: 'box' } }),
        leaf: declaration({ sub_tags: '' }),
    }, { content: abstractDeclaration({ sub_tags: '*' }) })); }
    get renderer_object() { return new ObjectRenderer(this); }
    card(root, text) { const box = root.box(); box.leaf(text); return box; }
    badge(root, { text }) { root.leaf(text); }
    main(root) { root.card('persisted'); root.badge({ text: 'fresh' }); }
}

test('neutral declarations, traversal and dialect-owned finalization need no DOM globals', () => {
    for (const name of ['document', 'window', 'HTMLElement', 'customElements']) {
        assert.equal(globalThis[name], undefined);
    }
    const builder = new TestBuilder(); builder.create();
    assert.equal(builder.schema.content, undefined);
    assert.equal(builder.schema.box.sub_tags, '*');
    const result = builder.render();
    assert.deepEqual(result.values.map(value => value.tag), ['box', 'leaf']);
    assert.equal(result.values[0].item[0].item, 'persisted');
    assert.equal(result.values[1].item, 'fresh');
});

test('containers persist while component expansion uses a fresh tree each render', () => {
    const builder = new TestBuilder(); builder.create();
    const count = builder.source.getNodes().length;
    builder.render(); builder.render();
    assert.equal(builder.source.getNodes().length, count);
    assert.equal(wrapSource(builder.source).card('later').nodeTag, 'box');
});

test('string finalization belongs to the base; object renderers supply their own', () => {
    const builder = new TestBuilder();
    assert.equal(new RendererBase(builder).finalize(['first', 'second']), 'firstsecond');
    assert.throws(() => builder.render({ target: false }), /object renderer/);
});


test('authoring handles require Source classes instead of a parentBag-shaped object', () => {
    const builder = new BuilderBase();
    const bag = new Bag();
    const ordinaryNode = bag.setItem('ordinary', 'value');
    assert.throws(() => builder.wrapSource(bag), /SourceBag or SourceBagNode/);
    assert.throws(() => builder.wrapSource(ordinaryNode), /SourceBag or SourceBagNode/);
    assert.throws(() => builder.wrapSource({parentBag: builder.source}), /SourceBag or SourceBagNode/);
    assert.strictEqual(builder.wrapSource(builder.source), builder.root);
});
