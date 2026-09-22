// Copyright 2025 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import { BuilderBase, RendererBase, SourceBag } from '../src/index.js';

const declaration = overrides => ({
    doc: null, sub_tags: null, parent_tags: null, inherits_from: null, ns: null,
    attributes: null, node_label: null, collection_key: null, _meta: null, ...overrides,
});
const grammar = {
    document_format: { name: 'builder_grammar', version: '1.1' },
    grammar: { name: 'document', version: null, title: null, description: null },
    abstracts: {},
    elements: {
        group: declaration({ sub_tags: 'leaf' }),
        leaf: declaration({ sub_tags: '' }),
        outside: declaration({ sub_tags: '' }),
    },
};
class ObjectRenderer extends RendererBase {
    static renderType = 'object';
    static mode = 'object';
    renderedItem(_node, value, attrs, { tag }) { return { tag, value, attrs }; }
    finalize(fragments, target) {
        if (target) { target.full(fragments); return null; }
        return fragments;
    }
}
class DocumentBuilder extends BuilderBase {
    static _defaultRenderMode = 'xml';
    get renderer_object() { return new ObjectRenderer(this); }
}
const makeBuilder = () => new DocumentBuilder().loadGrammar(grammar, { replace: true });

test('one Source materializes distinct representations without delivery or mutation', () => {
    const builder = makeBuilder();
    const source = builder.source;
    const group = builder.root.group(); group.leaf('hello');
    let deliveries = 0;
    builder.setRenderTarget(() => { deliveries++; }, 'xml');
    const text = builder.materialize(null);
    assert.deepEqual(text, ['<group><leaf>hello</leaf></group>']);
    assert.strictEqual(builder.materialized.xml, text);
    const objects = builder.materialize('object');
    assert.equal(objects[0].value[0].value, 'hello');
    assert.strictEqual(builder.materialized.object, objects);
    assert.strictEqual(builder.source, source);
    assert.equal(source.getNodes().length, 1);
    assert.equal(deliveries, 0);
    group.leaf('later');
    assert.notStrictEqual(builder.materialize('xml'), text);
    assert.throws(() => builder.getRenderer('missing'), /renderer_missing/);
});

test('render targets are isolated by mode and target=false bypasses the string destination', () => {
    const builder = makeBuilder(); builder.root.leaf('hello');
    let xml, objects;
    builder.setRenderTarget(value => { xml = value; });
    builder.setRenderTarget({ full(value) { objects = value; } }, 'object');
    assert.equal(builder.render({ mode: null }), null);
    assert.equal(xml, '<leaf>hello</leaf>');
    assert.equal(objects, undefined);
    assert.equal(builder.render({ mode: 'object' }), null);
    assert.equal(objects[0].value, 'hello');
    xml = undefined;
    assert.equal(builder.render({ target: false }), '<leaf>hello</leaf>');
    assert.equal(xml, undefined);
    assert.throws(() => builder.render({ mode: 'object', target: false }), /object renderer/);
});

test('target render options apply to the walk and explicit options take precedence', () => {
    const builder = makeBuilder(); builder.root.leaf('hello');
    const target = { renderOpts: { pretty: true }, full(value) { this.value = value; } };
    builder.setRenderTarget(target);
    builder.render(); assert.equal(target.value, '<leaf>hello</leaf>\n');
    builder.render({ pretty: false }); assert.equal(target.value, '<leaf>hello</leaf>');
});

test('prebuilt child branches are checked before insertion', () => {
    const builder = makeBuilder();
    const children = new SourceBag(null, builder);
    builder.setChild(children, 'outside', 'bad', {});
    assert.throws(() => builder.root.group(children), /not allowed as child/);
    assert.equal(builder.source.getNodes().length, 0);
    assert.equal(children.getNodes().length, 1);
    assert.throws(() => builder.setChild(builder.source, 'unknown', null, {}), /unknown element/);
});

test('duplicate node IDs are rejected across nested and promoted parents', () => {
    const builder = makeBuilder();
    builder.root.leaf('first', { node_id: 'unique' });
    const group = builder.root.group('original');
    assert.throws(() => group.leaf('duplicate', { node_id: 'unique' }), /Duplicate node_id/);
    assert.equal(group.value, 'original');
    const valid = group.leaf('valid', { node_id: 'second' });
    assert.equal(valid.value, 'valid');
    assert.throws(() => builder.root.leaf('duplicate', { node_id: 'second' }), /Duplicate node_id/);
    assert.equal(builder.nodeById('unique').value, 'first');
});


test('string finalization does not disguise object fragments as text', () => {
    assert.throws(() => new RendererBase(makeBuilder()).finalize([{}]), /string fragments/);
});


test('renderer mode determines its registered destination even through an alias', () => {
    class AliasedBuilder extends DocumentBuilder {
        get renderer_preview() { return this.renderer_xml; }
    }
    const builder = new AliasedBuilder().loadGrammar(grammar, { replace: true });
    builder.root.leaf('hello');
    let delivered;
    builder.setRenderTarget(value => { delivered = value; }, 'xml');
    builder.render({ mode: 'preview' });
    assert.equal(delivered, '<leaf>hello</leaf>');
});
