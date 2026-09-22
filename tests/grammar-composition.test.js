// Copyright 2025 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import { BuilderBase } from '../src/index.js';

const declaration = (overrides = {}) => ({
    doc: null, sub_tags: null, parent_tags: null, inherits_from: null, ns: null,
    attributes: null, node_label: null, collection_key: null, _meta: null, ...overrides,
});
const abstract = (overrides = {}) => {
    const value = declaration(overrides);
    delete value.node_label;
    delete value.collection_key;
    return value;
};
const document = (name, elements = {}, abstracts = {}) => ({
    document_format: { name: 'builder_grammar', version: '1.1' },
    grammar: { name, version: null, title: null, description: null },
    abstracts,
    elements,
});

test('a later collection may inherit an abstract loaded by an earlier collection', () => {
    const builder = new BuilderBase()
        .loadGrammar(document('base', {}, { flow: abstract({ sub_tags: 'leaf' }) }), { replace: true })
        .loadGrammar(document('extension', {
            panel: declaration({ inherits_from: 'flow' }),
            leaf: declaration({ sub_tags: '' }),
        }));

    assert.equal(builder.schema.panel.sub_tags, 'leaf');
    assert.equal(builder.schema.panel._subSpec.get('leaf').max, Infinity);
});

test('merge updates inherited class grammar without changing the class', () => {
    class Host extends BuilderBase {
        static { this.defineGrammar(document('host', { native: declaration({ sub_tags: '' }) })); }
    }
    const builder = new Host();
    const before = builder.schema;

    builder.loadGrammar(document('extension', { native: {sub_tags:'*'} }));
    assert.notStrictEqual(builder.schema, before);
    assert.equal(builder.schema.native.sub_tags, '*');
    assert.equal(new Host().schema.native.sub_tags, '');
});

test('case-insensitive element collisions are rejected atomically', () => {
    const builder = new BuilderBase().loadGrammar(
        document('first', { Item: declaration({ sub_tags: '' }) }),
        { replace: true },
    );
    const before = Object.keys(builder.schema);

    assert.throws(
        () => builder.loadGrammar(document('second', { item: declaration({ sub_tags: '' }) })),
        /case-insensitive collision/,
    );
    assert.deepEqual(Object.keys(builder.schema), before);
    assert.equal(builder._collection.toDocument().grammar.name, 'first');
});

test('case-insensitive collisions inside one document are rejected', () => {
    const builder = new BuilderBase();
    assert.throws(
        () => builder.loadGrammar(document('ambiguous', {
            Item: declaration({ sub_tags: '' }),
            item: declaration({ sub_tags: '' }),
        }), { replace: true }),
        /case-insensitive collision/,
    );
});


test('class grammars reject ambiguous names before replacing their schema', () => {
    class Parent extends BuilderBase {
        static { this.defineGrammar(document('parent', { Item: declaration({ sub_tags: '' }) })); }
    }
    class Child extends Parent {}
    const before = Child._classSchema;
    for (const grammar of [document('child', { item: declaration({ sub_tags: '*' }) })]) {
        assert.throws(() => Child.defineGrammar(grammar), /case-insensitive collision/);
        assert.strictEqual(Child._classSchema, before);
        assert.equal(new Child().schemaTag('ITEM'), 'Item');
    }
    assert.throws(
        () => class Ambiguous extends BuilderBase {
            static { this.defineGrammar(document('ambiguous', {
                Item: declaration(), item: declaration(),
            })); }
        },
        /case-insensitive collision/,
    );
});

test('class grammar requires a canonical builder_grammar document', () => {
    class Host extends BuilderBase {}
    assert.throws(
        () => Host.defineGrammar({ elements: { leaf: { sub_tags: '' } } }),
        /document_format/,
    );
    assert.equal(Object.hasOwn(Host, '_classCollection'), false);
});

test('a subclass can override an exact tag without changing its parent', () => {
    class Parent extends BuilderBase {
        static { this.defineGrammar(document('parent', { Item: declaration({ sub_tags: '' }) })); }
    }
    class Child extends Parent {
        static { this.defineGrammar(document('child', { Item: declaration({ sub_tags: '*' }) })); }
    }
    assert.equal(new Child().schemaTag('item'), 'Item');
    assert.equal(new Child().schema.Item.sub_tags, '*');
    assert.equal(new Parent().schema.Item.sub_tags, '');
});

test('a subclass abstract override re-resolves inherited elements without changing its parent', () => {
    class Parent extends BuilderBase {
        static { this.defineGrammar(document('parent', {
            panel: declaration({ inherits_from: 'flow' }),
        }, { flow: abstract({ sub_tags: 'oldLeaf' }) })); }
    }
    class Child extends Parent {
        static { this.defineGrammar(document('child', {}, {
            flow: abstract({ sub_tags: 'newLeaf' }),
        })); }
    }

    assert.equal(new Parent().schema.panel.sub_tags, 'oldLeaf');
    assert.equal(new Child().schema.panel.sub_tags, 'oldLeaf,newLeaf');
});

test('a portable subclass element may inherit a parent abstract', () => {
    class Parent extends BuilderBase {
        static { this.defineGrammar(document('parent', {}, {
            flow: abstract({ sub_tags: 'leaf' }),
        })); }
    }
    class Child extends Parent {
        static { this.defineGrammar(document('child', {
            panel: declaration({ inherits_from: 'flow' }),
        })); }
    }

    assert.equal(new Child().schema.panel.sub_tags, 'leaf');
});

test('a subclass abstract override re-resolves inherited abstract chains', () => {
    class Parent extends BuilderBase {
        static { this.defineGrammar(document('parent', {
            panel: declaration({ inherits_from: 'flow' }),
        }, {
            base: abstract({ sub_tags: 'oldLeaf' }),
            flow: abstract({ inherits_from: 'base' }),
        })); }
    }
    class Child extends Parent {
        static { this.defineGrammar(document('child', {}, {
            base: abstract({ sub_tags: 'newLeaf' }),
        })); }
    }

    assert.equal(new Parent().schema.panel.sub_tags, 'oldLeaf');
    assert.equal(new Child().schema.panel.sub_tags, 'oldLeaf,newLeaf');
});

test('a subclass inheritance cycle fails without changing inherited class state', () => {
    class Parent extends BuilderBase {
        static { this.defineGrammar(document('parent', {
            panel: declaration({ inherits_from: 'base' }),
        }, { base: abstract({ sub_tags: 'leaf' }) })); }
    }
    class Child extends Parent {}
    const schema = Child._classSchema;
    const abstracts = Child._abstracts;

    assert.throws(() => Child.defineGrammar(document('cycle', {}, {
        base: abstract({ inherits_from: 'loop' }),
        loop: abstract({ inherits_from: 'base' }),
    })), /inheritance cycle/);
    assert.strictEqual(Child._classSchema, schema);
    assert.strictEqual(Child._abstracts, abstracts);
    assert.equal(Object.hasOwn(Child, '_classCollection'), false);
});

test('class grammar uses portable multiple-parent and falsy-field precedence', () => {
    class Multiple extends BuilderBase {
        static { this.defineGrammar(document('multiple', {
            inherited: declaration({ inherits_from: 'first,second' }),
            empty: declaration({ inherits_from: 'first', sub_tags: '' }),
        }, {
            first: abstract({ sub_tags: 'firstLeaf', ns: 'first' }),
            second: abstract({ sub_tags: 'secondLeaf', parent_tags: 'host', ns: 'second' }),
        })); }
    }

    assert.equal(new Multiple().schema.inherited.sub_tags, 'firstLeaf');
    assert.equal(new Multiple().schema.inherited.parent_tags, 'host');
    assert.equal(new Multiple().schema.inherited.ns, 'first');
    assert.equal(new Multiple().schema.empty.sub_tags, 'firstLeaf');
});

test('static container arrays reject casefold collisions across inheritance', () => {
    class Parent extends BuilderBase {
        static containers = ['Card'];
        Card() {}
    }
    class ConflictingChild extends Parent { static containers = ['card']; card() {} }
    assert.throws(() => new ConflictingChild().containerMethod('card'), /cannot rebind to 'card'/);
});

test('a subclass may override the implementation under the same method name', () => {
    class Parent extends BuilderBase {
        static containers = ['buildCard'];
        buildCard() { return 'parent'; }
    }
    class Child extends Parent {
        static containers = ['buildCard'];
        buildCard() { return 'child'; }
    }
    const builder = new Child();
    assert.equal(builder.containerMethod('BUILDCARD'), 'buildCard');
    assert.equal(builder.buildCard(), 'child');
});


test('loading or replacing grammar preserves the document name', () => {
    const builder = new BuilderBase('main');
    builder.loadGrammar(document('first', { leaf: declaration() }), { replace: true });
    assert.equal(builder.name, 'main');
    builder.loadGrammar(document('second', { box: declaration() }));
    assert.equal(builder.name, 'main');
    builder.loadGrammar(document('third', { other: declaration() }), { replace: true });
    assert.equal(builder.name, 'main');
});

test('successive documents update metadata, even with the same collection name', () => {
    const entry = declaration({ _meta: { render_tag: 'leaf', options: ['a', 'b'] } });
    const original = document('first', { leaf: entry });
    const reverseKeys = value => Array.isArray(value) ? value.map(reverseKeys)
        : value && typeof value === 'object'
            ? Object.fromEntries(Object.entries(value).reverse().map(([k, v]) => [k, reverseKeys(v)]))
            : value;
    const builder = new BuilderBase().loadGrammar(original, { replace: true });
    assert.strictEqual(builder.loadGrammar(reverseKeys(original)), builder);
    assert.strictEqual(builder.loadGrammar(document('shared', { leaf: reverseKeys(entry) })), builder);
    const changedOrder = structuredClone(original);
    changedOrder.elements.leaf._meta.options.reverse();
    builder.loadGrammar(changedOrder);
    assert.deepEqual(builder.schema.leaf._meta.options, ['b', 'a']);
    const changedValue = structuredClone(entry);
    changedValue._meta.render_tag = 'other';
    builder.loadGrammar(document('updated', { leaf: changedValue }));
    assert.equal(builder.schema.leaf._meta.render_tag, 'other');
});
