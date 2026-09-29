// Copyright 2026 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {BuilderBase, Collection, HtmlBuilder} from '../src/index.js';

// The documents are shared with the Python implementation (genro-builders#50).
const fixture = name => JSON.parse(readFileSync(new URL(`./fixtures/grammar-replace/${name}.json`, import.meta.url), 'utf8'));
const varKeywords = element => element.attributes.parameters.filter(p => p.kind === 'var_keyword');

class Dialect extends HtmlBuilder {
    static _name = 'dialect';
    static { this.defineGrammar(fixture('dialect-data-elements')); }
}
class Parent extends BuilderBase {
    static { this.defineGrammar(fixture('replace-parent')); }
}
class Child extends Parent {
    static { this.defineGrammar(fixture('replace-child')); }
}

test('a subclass document replaces the data-elements of its parent', () => {
    const schema = Dialect._classSchema;
    assert.deepEqual(schema.dataSetter.attributes.parameters.map(p => p.name), ['destination_path', 'value', 'attr']);
    assert.deepEqual(schema.dataFormula.attributes.parameters.map(p => p.name), ['destination_path', 'func', 'params']);
    assert.deepEqual(schema.dataController.attributes.parameters.map(p => p.name), ['func', 'params']);
    for (const name of ['dataSetter', 'dataFormula', 'dataController']) {
        assert.equal(varKeywords(schema[name]).length, 1, name);
    }
    assert.equal(schema.dataSetter.attributes.parameters[1].default, null);
});

test('the replaced data-element validates on the subclass and still fails on the parent', () => {
    const attrs = {destination_path: 'x', value: 1};
    assert.equal(new Dialect().validateNodeValues('dataSetter', null, attrs), true);
    assert.throws(() => new HtmlBuilder().validateNodeValues('dataSetter', null, attrs), /missing required attribute 'destination'/);
    assert.throws(() => new Dialect().validateNodeValues('dataSetter', null, {destination: 'x', value: 1}),
        /missing required attribute 'destination_path'/);
});

test('a redefined element keeps nothing of the parent definition', () => {
    const panel = Child._classSchema.panel;
    assert.deepEqual(panel.attributes.parameters.map(p => p.name), ['lbl']);
    assert.equal(panel.sub_tags, 'leaf');
    assert.equal(panel.parent_tags ?? null, null);
    assert.equal(panel.inherits_from ?? null, null);
    assert.equal(panel.ns ?? null, null);
    assert.equal(panel.doc ?? null, null);
    assert.deepEqual(panel._meta, {origin: 'child'});
    const document = Child._classCollection.toDocument();
    assert.deepEqual(document.elements.panel, fixture('replace-child').elements.panel);
});

test('elements and abstracts not named by the subclass document are identical to the parent', () => {
    const parent = Parent._classCollection.toDocument();
    const child = Child._classCollection.toDocument();
    for (const name of ['leaf', 'extra', 'root', 'other']) {
        assert.deepEqual(child.elements[name], parent.elements[name], name);
        assert.deepEqual(Child._classSchema[name], Parent._classSchema[name], name);
    }
    assert.deepEqual(child.abstracts.untouched, parent.abstracts.untouched);
    assert.deepEqual(Child._abstracts.untouched, Parent._abstracts.untouched);
});

test('a redefined abstract replaces the parent abstract without changing the parent', () => {
    const child = Child._classCollection.toDocument();
    assert.deepEqual(child.abstracts.flow, fixture('replace-child').abstracts.flow);
    assert.equal(Child._abstracts.flow.sub_tags, 'extra');
    assert.equal(Parent._abstracts.flow.sub_tags, 'leaf');
    assert.equal(Parent._classSchema.panel.attributes.parameters.length, 2);
    assert.equal(Parent._classSchema.panel.ns, 'parent_ns');
});

test('a redefined element loses the parent abstract it no longer inherits', () => {
    const document = fixture('replace-child');
    document.elements.panel.inherits_from = 'flow';
    document.elements.panel.sub_tags = null;
    class Inheriting extends Parent { static { this.defineGrammar(document); } }
    assert.equal(Inheriting._classSchema.panel.sub_tags, 'extra');
});

test('grammar metadata keeps merging and a null value keeps the earlier one', () => {
    const base = fixture('replace-parent');
    base.grammar = {name: 'base', version: '1', title: 'Title', description: null};
    const extension = fixture('replace-child');
    extension.grammar = {name: 'extension', version: null, title: null, description: 'Text'};
    const result = new Collection(base).update(extension).toDocument();
    assert.deepEqual(result.grammar, {name: 'extension', version: '1', title: 'Title', description: 'Text'});
});

test('loadGrammar without replace follows the same rule', () => {
    const builder = new BuilderBase().loadGrammar(fixture('replace-parent'), {replace: true});
    builder.loadGrammar(fixture('replace-child'));
    assert.deepEqual(builder.schema.panel.attributes.parameters.map(p => p.name), ['lbl']);
    assert.equal(builder.schema.panel.sub_tags, 'leaf');
    assert.deepEqual(builder.schema.panel._meta, {origin: 'child'});
    assert.deepEqual(builder.schema.other, Parent._classSchema.other);
    const collection = builder._collection.toDocument();
    assert.equal(collection.abstracts.flow.sub_tags, 'extra');
    assert.deepEqual(collection.abstracts.untouched, fixture('replace-parent').abstracts.untouched);
});

test('loadGrammar on a dialect instance replaces an inherited data-element', () => {
    const builder = new HtmlBuilder();
    builder.loadGrammar(fixture('dialect-data-elements'));
    assert.deepEqual(builder.schema.dataSetter.attributes.parameters.map(p => p.name), ['destination_path', 'value', 'attr']);
    assert.equal(builder.validateNodeValues('dataSetter', null, {destination_path: 'x', value: 1}), true);
    assert.throws(() => new HtmlBuilder().validateNodeValues('dataSetter', null, {destination_path: 'x', value: 1}));
});

test('loadGrammar with replace still discards the earlier grammar', () => {
    const builder = new BuilderBase().loadGrammar(fixture('replace-parent'), {replace: true});
    builder.loadGrammar(fixture('replace-child'), {replace: true});
    assert.deepEqual(Object.keys(builder.schema), ['panel']);
    assert.deepEqual(builder._collection.toDocument(), fixture('replace-child'));
});

test('component expansion adds component entries and leaves the other elements unchanged', () => {
    class Page extends HtmlBuilder {
        static components = ['badge'];
        badge(root, {text}) { root.span(text); }
        main(root) { root.badge({text: 'x'}); }
    }
    const before = Page._classCollection.toDocument();
    const builder = new Page();
    builder.create();
    const after = builder._collection.toDocument();
    assert.equal(after.elements.badge.sub_tags, '');
    assert.deepEqual(after.elements.badge._meta, {component: true});
    assert.deepEqual(after.abstracts, before.abstracts);
    for (const [name, entry] of Object.entries(before.elements)) assert.deepEqual(after.elements[name], entry, name);
    assert.equal(builder.render(), '<span>x</span>');
});
