// Copyright 2025 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { BuilderBase, wrapSource } from '../src/index.js';

const declaration = (overrides = {}) => ({
    doc: null, sub_tags: null, parent_tags: null, inherits_from: null, ns: null,
    attributes: null, node_label: null, collection_key: null, _meta: null, ...overrides,
});
const abstract = (overrides = {}) => {
    const value = declaration(overrides); delete value.node_label; delete value.collection_key; return value;
};
const document = (name, elements, abstracts = {}) => ({
    document_format: { name: 'builder_grammar', version: '1.1' },
    grammar: { name, version: null, title: null, description: null }, abstracts, elements,
});

test('loads bundled exported HTML/SVG documents and isolates instance schemas', () => {
    const html = JSON.parse(fs.readFileSync(new URL('../src/collections/html5.json', import.meta.url)));
    const svg = JSON.parse(fs.readFileSync(new URL('../src/collections/svg.json', import.meta.url)));
    const first = new BuilderBase().loadGrammar(html, { replace: true });
    const second = new BuilderBase().loadGrammar(svg, { replace: true });
    assert(first.schema.div); assert(!first.schema.circle);
    assert(second.schema.circle); assert(!second.schema.div);
});

test('loaded grammar validates required values, ranges, cardinality and labels', () => {
    const signature = { parameters: [
        { name: 'name', kind: 'keyword_only', role: 'attribute', annotation: null, has_default: false },
        { name: 'score', kind: 'keyword_only', role: 'attribute', annotation: { kind: 'annotated', base: { kind: 'type', module: 'builtins', name: 'int' }, metadata: [{ kind: 'range', ge: 1, le: 5, gt: null, lt: null }] }, has_default: false },
    ], accepts_var_keyword: false, accepts_var_positional: false };
    const doc = document('future', {
        root: declaration({ sub_tags: 'item[1:2]', collection_key: '${name}' }),
        item: declaration({ sub_tags: '', parent_tags: 'root', attributes: signature }),
    });
    const builder = new BuilderBase().loadGrammar(doc, { replace: true });
    const root = builder.setChild(builder.source, 'root', null, {});
    const wrapped = wrapSource(root);
    assert.throws(() => wrapped.item({ score: 2 }), /missing required attribute 'name'/);
    assert.throws(() => wrapped.item({ name: 'a', score: 8 }), /invalid value/);
    wrapped.item({ name: 'a', score: 2 });
    assert.deepEqual(builder.validateSource(), []);
    assert.throws(() => wrapped.item({ name: 'b', score: 3, extra: true }), /unknown attribute/);
    assert.equal(builder.validateParent('root'), true);
    assert.equal(builder.validateParent('item', 'root'), true);
    assert.throws(() => builder.validateParent('item'), /requires a declared parent/);
});

test('merge is atomic, permits identical overlap, and rejects malformed descriptors', () => {
    const shared = declaration({ sub_tags: '' });
    const builder = new BuilderBase().loadGrammar(document('one', { shared }), { replace: true });
    builder.loadGrammar(document('two', { shared, extra: declaration({ sub_tags: '*' }) }));
    const before = Object.keys(builder.schema);
    builder.loadGrammar(document('extension', { shared: {sub_tags:'x'} }));
    assert.equal(builder.schema.shared.sub_tags, 'x');
    assert.deepEqual(Object.keys(builder.schema), before);
    const invalid = document('invalid', { x: declaration({ attributes: { parameters: [{ name: 'x', kind: 'keyword_only', role: 'attribute', annotation: { kind: 'mystery' }, has_default: false }], accepts_var_keyword: false, accepts_var_positional: false } }) });
    assert.throws(() => builder.loadGrammar(invalid), /unknown annotation kind/);
});

test('portable signatures reject variadic summary flags that disagree with parameters', () => {
    const signature = (parameters, acceptsVarKeyword, acceptsVarPositional) => ({
        parameters,
        accepts_var_keyword: acceptsVarKeyword,
        accepts_var_positional: acceptsVarPositional,
    });
    const varKeyword = {
        name: 'kwargs', kind: 'var_keyword', role: 'attribute',
        annotation: null, has_default: false,
    };
    const varPositional = {
        name: 'args', kind: 'var_positional', role: 'attribute',
        annotation: null, has_default: false,
    };
    const loaded = new BuilderBase().loadGrammar(document('valid-variadics', {
        leaf: declaration({ attributes: signature([varKeyword, varPositional], true, true) }),
    }), { replace: true });
    assert(loaded.schema.leaf);
    assert.throws(() => new BuilderBase().loadGrammar(document('missing-var-keyword', {
        leaf: declaration({ attributes: signature([], true, false) }),
    }), { replace: true }), /variadic summary flags do not match parameters/);
    assert.throws(() => new BuilderBase().loadGrammar(document('unreported-var-positional', {
        leaf: declaration({ attributes: signature([varPositional], false, false) }),
    }), { replace: true }), /variadic summary flags do not match parameters/);
});

test('portable declaration names follow the Python public-name boundary', () => {
    const builder = new BuilderBase().loadGrammar(document('public-names', {
        'custom-element': declaration({ sub_tags: '' }),
        class: declaration({ sub_tags: '' }),
        città: declaration({ sub_tags: '' }),
    }), { replace: true });
    assert(builder.schema['custom-element']);
    assert(builder.schema.class);
    assert(builder.schema.città);
    assert.throws(() => new BuilderBase().loadGrammar(document('private-element', {
        _private: declaration({ sub_tags: '' }),
    }), { replace: true }), /elements: invalid public name '_private'/);
    assert.throws(() => new BuilderBase().loadGrammar(document('private-abstract', {
        leaf: declaration({ sub_tags: '' }),
    }, {
        _private: abstract({ sub_tags: '*' }),
    }), { replace: true }), /abstracts: invalid public name '_private'/);
});

test('portable grammar semantics match Python cardinality, inheritance and regex fullmatch', () => {
    const inherited = document('inheritance', {
        root: declaration({ inherits_from: 'base', sub_tags: null }),
        token: declaration({ sub_tags: '', attributes: { parameters: [{
            name: 'code', kind: 'keyword_only', role: 'attribute', has_default: false,
            annotation: { kind: 'annotated', base: { kind: 'type', module: 'builtins', name: 'str' }, metadata: [{ kind: 'regex', pattern: '[A-Z]+', flags: 0 }] },
        }], accepts_var_keyword: false, accepts_var_positional: false } }),
    }, { base: abstract({ sub_tags: 'token' }) });
    const builder = new BuilderBase().loadGrammar(inherited, { replace: true });
    const root = wrapSource(builder.setChild(builder.source, 'root', null, {}));
    root.token({ code: 'ABC' }); root.token({ code: 'XYZ' }); // bare token is 0..N
    assert.throws(() => root.token({ code: 'ABC!' }), /invalid value/);
    assert.throws(() => builder.validateNodeValues('token', null, { code: 'ABC', _secret: 1 }), /unknown attribute '_secret'/);
    assert.throws(() => builder.loadGrammar(document('bad-cardinality', { x: declaration({ sub_tags: 'y[]' }) }), { replace: true }), /invalid cardinality/);
    builder.loadGrammar(document('replacement', { fresh: declaration({ sub_tags: '' }) }), { replace: true });
    assert.deepEqual(Object.keys(builder.schema), ['fresh']);
});

test('portable regex uses fullmatch with alternative backtracking and rejects Unicode classes', () => {
    const withRegex = pattern => document('regex', { token: declaration({
        sub_tags: '', attributes: { parameters: [{
            name: 'code', kind: 'keyword_only', role: 'attribute', has_default: false,
            annotation: { kind: 'annotated', base: { kind: 'type', module: 'builtins', name: 'str' }, metadata: [{ kind: 'regex', pattern, flags: 32 }] },
        }], accepts_var_keyword: false, accepts_var_positional: false },
    }) });
    const builder = new BuilderBase().loadGrammar(withRegex('a|ab'), { replace: true });
    builder.validateNodeValues('token', null, { code: 'ab' });
    assert.throws(() => builder.validateNodeValues('token', null, { code: 'aba' }), /invalid value/);
    assert.throws(() => builder.loadGrammar(withRegex('\\w+'), { replace: true }), /non-portable/);
});

test('canonical documents define class grammar', () => {
    class Canonical extends BuilderBase {
        static { this.defineGrammar(document('canonical', { leaf: declaration({ sub_tags: '' }) })); }
    }
    const builder = new Canonical();
    assert.equal(wrapSource(builder.source).leaf('text').value, 'text');
});

test('full portable documents used as class grammar keep typed validation', () => {
    assert.throws(() => {
        class Invalid extends BuilderBase {
            static { this.defineGrammar(document('invalid', {
                leaf: declaration({ sub_tags: 42 }),
            })); }
        }
        return Invalid;
    }, /sub_tags.*must be string/);
});

test('rejected nested authoring leaves a scalar parent unchanged', () => {
    const builder = new BuilderBase().loadGrammar(document('strict', {
        parent: declaration({ sub_tags: 'allowed' }),
        allowed: declaration({ sub_tags: '', parent_tags: 'parent' }),
        forbidden: declaration({ sub_tags: '', parent_tags: 'other' }),
    }), { replace: true });
    const parent = builder.root.parent('leading text');
    assert.throws(() => parent.forbidden('no'), /not allowed|requires/);
    assert.equal(parent.value, 'leading text');
    assert.deepEqual(parent.getAttr(), {});
});



test('tuple annotations validate each position and fixed length, or ellipsis items', () => {
    const type = name => ({kind:'type', module:'builtins', name});
    const make = arguments_ => new BuilderBase().loadGrammar(document('tuple', {
        item: declaration({attributes: {parameters: [{name:'pair', kind:'keyword_only',
            role:'attribute', annotation:{kind:'generic', origin:type('tuple'), arguments:arguments_},
            has_default:false}], accepts_var_keyword:false, accepts_var_positional:false}}),
    }), {replace:true});
    const fixed = make([type('int'), type('str')]);
    fixed.root.item({pair:[1, 'a']});
    for (const pair of [[1, 2], [1], [1, 'a', 'b']]) {
        assert.throws(() => fixed.root.item({pair}), /invalid value/);
    }
    const variadic = make([type('int'), {kind:'ellipsis'}]);
    variadic.root.item({pair:[]});
    variadic.root.item({pair:[1, 2, 3]});
    assert.throws(() => variadic.root.item({pair:[1, 'a']}), /invalid value/);
});

test('Python-unsupported Callable generic descriptors are rejected', () => {
    for (const annotation of [
        {kind:'arguments', items:[]},
        {kind:'generic', origin:{kind:'type', module:'collections.abc', name:'Callable'}, arguments:[]},
    ]) {
        const attributes = {parameters:[{name:'func', kind:'keyword_only', role:'attribute',
            annotation, has_default:false}], accepts_var_keyword:false, accepts_var_positional:false};
        assert.throws(() => new BuilderBase().loadGrammar(document('unsupported', {
            item: declaration({attributes}),
        }), {replace:true}), /not supported|only list/);
    }
});
