// Copyright 2025 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import { Bag } from '@jsr/genro__bag';
import { BuilderBase, sourceTarget } from '../src/index.js';
import { declaration, grammarDocument } from './grammar-fixture.js';

class ComponentBuilder extends BuilderBase {
    static _name = 'component_test';
    static _defaultRenderMode = 'xml';
    static components = ['panel'];
    static { this.defineGrammar(grammarDocument('components', {
        outer: declaration({ sub_tags: '*' }),
        box: declaration({ sub_tags: '*' }),
        leaf: declaration({ sub_tags: '' }),
    })); }

    constructor() {
        super();
        this.expansions = [];
        this._resolveComponents();
    }

    panel(root, kwargs) {
        this.expansions.push({
            anchor: sourceTarget(root).parentNode.getAttr('datapath'),
            kwargs: { ...kwargs },
        });
        root.box().leaf(kwargs.text ?? kwargs.node_label);
    }
}

test('static components expand parameters and store anchors without render side effects', () => {
    const builder = new ComponentBuilder();
    builder.data.setItem('title', 'stored');
    builder.root.panel(null, {
        text: '^title', store: 'records.current', id: 'authored', lazy: true,
    });

    assert.equal(
        builder.render({ target: false }),
        '<box><leaf>stored</leaf></box>',
    );
    assert.deepEqual(builder.expansions, [{
        anchor: 'records.current',
        kwargs: { text: '^title', id: 'authored', lazy: true },
    }]);
    assert.equal(builder.source.getNodes().length, 1);
});

test('iterate is author-selected and expands one block per Bag child', () => {
    const rows = new Bag();
    rows.setItem('first', 1);
    rows.setItem('second', 2);
    const builder = new ComponentBuilder();
    builder.data.setItem('rows', rows);
    builder.root.panel(null, { iterate: '^rows' });

    assert.equal(
        builder.render({ target: false }),
        '<box><leaf>first</leaf></box><box><leaf>second</leaf></box>',
    );
    assert.deepEqual(builder.expansions, [
        { anchor: 'rows', kwargs: { node_label: 'first' } },
        { anchor: 'rows', kwargs: { node_label: 'second' } },
    ]);
});

test('component expansions carry their authored depth into pretty output', () => {
    const builder = new ComponentBuilder();
    builder.root.outer().panel({ text: 'nested' });

    assert.equal(
        builder.render({ target: false, pretty: true }),
        '<outer>\n  <box>\n    <leaf>nested</leaf>\n  </box>\n</outer>\n',
    );
});

test('a component must expand to exactly one root tree', () => {
    class ForestBuilder extends ComponentBuilder {
        panel(root) {
            root.leaf('one');
            root.leaf('two');
        }
    }
    const builder = new ForestBuilder();
    builder.root.panel();
    assert.throws(() => builder.render({ target: false }), /tree, not a forest: 2/);
});

test('static component arrays compose across inheritance', () => {
    class ParentPage extends BuilderBase {
        static _defaultRenderMode = 'xml';
        static { this.defineGrammar(grammarDocument('component-inheritance', {
            box: declaration({ sub_tags: '' }),
        })); }
        static components = ['parentCard'];
        parentCard(root) { root.box('parent'); }
    }
    class ChildPage extends ParentPage {
        static components = ['childCard'];
        childCard(root) { root.box('child'); }
        main(root) {
            root.parentCard();
            root.childCard();
        }
    }

    const page = new ChildPage();
    page.create();

    assert.equal(page.componentMethod('PARENTCARD'), 'parentCard');
    assert.equal(page.componentMethod('CHILDCARD'), 'childCard');
    assert.equal(page.schema.parentCard._meta.component, true);
    assert.equal(page.schema.childCard._meta.component, true);
    assert.equal(page.render({target: false}), '<box>parent</box><box>child</box>');
});

test('component case collisions fail atomically while exact-name overrides remain valid', () => {
    class ExactOverridePage extends BuilderBase {
        static { this.defineGrammar(grammarDocument('exact-component', {
            card: declaration({ sub_tags: '' }),
        })); }
        static components = ['card'];
        card(root) { root.box('replacement'); }
        main() {}
    }
    const exact = new ExactOverridePage();
    exact.create();
    assert.equal(exact.schema.card._meta.component, true);

    class CollisionPage extends BuilderBase {
        static { this.defineGrammar(grammarDocument('collision-component', {
            Card: declaration({ sub_tags: '' }),
        })); }
        static components = ['card'];
        card(root) { root.box('collision'); }
        main() {}
    }
    const collision = new CollisionPage();
    const schema = collision.schema;

    assert.throws(() => collision.create(), /case-insensitive collision/);
    assert.strictEqual(collision.schema, schema);
    assert.equal(collision._schemaOverride, null);
    assert.equal(collision._componentMap, null);
    assert.equal(collision._tagNamesOverride, null);
});
