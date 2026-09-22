// Copyright 2025 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import { BuilderBase, XmlRenderer } from '../src/index.js';

const declaration = (overrides = {}) => ({
    doc: null, sub_tags: null, parent_tags: null, inherits_from: null, ns: null,
    attributes: null, node_label: null, collection_key: null, _meta: null, ...overrides,
});

const GRAMMAR = {
    document_format: { name: 'builder_grammar', version: '1.1' },
    grammar: { name: 'xmltest', version: null, title: null, description: null },
    abstracts: {},
    elements: {
        root: declaration({ sub_tags: '*' }),
        child: declaration({ sub_tags: '*' }),
        leaf: declaration({ sub_tags: '' }),
        xsd_element: declaration({ sub_tags: '' }),
        foo_: declaration({ sub_tags: '' }),
        del_: declaration({ sub_tags: '' }),
        import_: declaration({ sub_tags: '' }),
    },
};

class XmlBuilder extends BuilderBase {
    static _name = 'xsd';
    static _defaultRenderMode = 'xml';
}

function builderWithSource() {
    const builder = new XmlBuilder();
    builder.loadGrammar(GRAMMAR, { replace: true });
    const root = builder.root.root({ title: 'A&B"' });
    root.child().leaf('1 < 2 & 3 > 0');
    root.xsd_element(null, { ns: 'xs', xmlns_xs: 'urn:a&b' });
    return builder;
}

test('XML rendering escapes text and attributes and renders nested elements', () => {
    const rendered = builderWithSource().render({ target: null, mode: 'xml' });
    assert.equal(
        rendered,
        '<root title="A&amp;B&quot;"><child><leaf>1 &lt; 2 &amp; 3 &gt; 0</leaf></child>'
        + '<xs:element xmlns:xs="urn:a&amp;b"></xs:element></root>',
    );
});

test('XML pretty output and document headers follow the Python contract', () => {
    const builder = builderWithSource();
    assert.equal(
        builder.render({ target: null, mode: 'xml', pretty: true, docHeader: true }),
        "<?xml version='1.0' encoding='UTF-8'?><root title=\"A&amp;B&quot;\">\n"
        + '  <child>\n    <leaf>1 &lt; 2 &amp; 3 &gt; 0</leaf>\n  </child>\n'
        + '  <xs:element xmlns:xs="urn:a&amp;b"></xs:element>\n</root>\n',
    );
    assert.equal(
        builder.render({ target: null, mode: 'xml', docHeader: '<!custom>' }),
        '<!custom><root title="A&amp;B&quot;"><child><leaf>1 &lt; 2 &amp; 3 &gt; 0</leaf></child>'
        + '<xs:element xmlns:xs="urn:a&amp;b"></xs:element></root>',
    );
});

test('XML rendering decodes only Python keyword escapes', () => {
    const builder = new XmlBuilder();
    builder.loadGrammar(GRAMMAR, { replace: true });
    builder.root.foo_(null, { from_: 'source', _class: 'legacy', new_: 'literal' });
    builder.root.del_();
    builder.root.import_(null, { ns: 'xs' });

    assert.equal(
        builder.render({ mode: 'xml' }),
        '<foo_ from="source" class="legacy" new_="literal"></foo_>'
        + '<del></del><xs:import></xs:import>',
    );
});

test('base finalization returns or delivers complete string output', () => {
    const renderer = new XmlRenderer({});
    assert.equal(renderer.finalize(['a', 'b'], null), 'ab');

    let called;
    assert.equal(renderer.finalize(['a', 'b'], value => { called = value; }), null);
    assert.equal(called, 'ab');

    const writable = { write(value) { this.value = value; } };
    assert.equal(renderer.finalize(['a', 'b'], writable), null);
    assert.equal(writable.value, 'ab');

    const wrapped = { full(value) { this.value = value; } };
    assert.equal(renderer.finalize(['a', 'b'], wrapped), null);
    assert.equal(wrapped.value, 'ab');

    assert.throws(() => renderer.finalize('x', 'out.xml'), /filesystem support/);
});

test('XML string composition rejects object fragments at document and child level', () => {
    const renderer = new XmlRenderer({});
    assert.throws(() => renderer.finalize([{}], null), /string fragments/);
    assert.throws(
        () => renderer.renderedItem(
            { fullpath: '_root_.root_0' },
            [{}],
            {},
            { tag: 'root' },
        ),
        /string fragments/,
    );
});
