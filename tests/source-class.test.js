// Copyright 2026 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
// Contract: a builder declares the SourceBag class of its Source.
//
// `BuilderBase._sourceClass` names the class instantiated for `_sourceroot`,
// for the `source` payload and for the component expansion root (legacy
// GenroPy `domSrcFactory`). The Source declares the class of its nodes
// (`nodeClass`). Branches created while authoring, including the promotion
// of a scalar node, follow the class of their parent bag, as in Python. On
// the TYTX wire the class survives when it is registered in the subtype
// dictionary of `X`.
import assert from 'node:assert/strict';
import test from 'node:test';
import { Bag } from '@jsr/genro__bag';
import { fromTytx, getSubtypeDict, setSubtypeDict, toTytx } from '@jsr/genro__tytx';
import { BuilderBase, SourceBag, SourceBagNode, sourceBagFromTytx, sourceBagToTytx } from '../src/index.js';
import { declaration, grammarDocument } from './grammar-fixture.js';

class TestSourceNode extends SourceBagNode {}

class TestSource extends SourceBag {
    get nodeClass() { return TestSourceNode; }
}

setSubtypeDict(TestSource.tytxSuffix, { ...getSubtypeDict(TestSource.tytxSuffix), TestSource });

class BoxBuilder extends BuilderBase {
    static { this.defineGrammar(grammarDocument('source-class-test', {
        box: declaration({ sub_tags: '*' }), leaf: declaration({ sub_tags: '' }),
    })); }
    main() {}
}

class TestSourceBuilder extends BoxBuilder {
    static _sourceClass = TestSource;
    main(root) {
        const outer = root.box();
        outer.box().leaf('hello');
        const promoted = root.box('scalar');
        promoted.leaf('child');
    }
}

/** Every Bag value of the tree, depth first. */
function branches(bag) {
    return bag.getNodes().flatMap((node) => {
        const value = node.getValue(true);
        return value instanceof Bag ? [value, ...branches(value)] : [];
    });
}

/** Every node of the tree, depth first. */
function nodes(bag) {
    return bag.getNodes().flatMap((node) => {
        const value = node.getValue(true);
        return value instanceof Bag ? [node, ...nodes(value)] : [node];
    });
}

function page() {
    const builder = new TestSourceBuilder();
    builder.create();
    return builder;
}

test('the default Source class is SourceBag', () => {
    const builder = new BoxBuilder();
    assert.equal(BuilderBase._sourceClass, SourceBag);
    assert.equal(builder._sourceroot.constructor, SourceBag);
    assert.equal(builder.source.constructor, SourceBag);
});

test('the root and its wrapper use the declared class', () => {
    const builder = page();
    assert.equal(builder._sourceroot.constructor, TestSource);
    assert.equal(builder.source.constructor, TestSource);
    assert.equal(builder.source._builder, builder);
});

test('nested branches and nodes follow the parent class', () => {
    const builder = page();
    const all = branches(builder.source);
    assert.equal(all.length, 3);
    assert.ok(all.every((branch) => branch.constructor === TestSource));
    assert.ok(nodes(builder.source).every((node) => node.constructor === TestSourceNode));
});

test('a promoted scalar node gets the declared class', () => {
    const builder = page();
    const promoted = builder.source.node('box_1');
    assert.equal(promoted.getValue(true).constructor, TestSource);
    assert.equal(promoted.getValue(true).node('leaf_0').constructor, TestSourceNode);
});

test('the expansion root uses the declared class', () => {
    const builder = new TestSourceBuilder();
    const expansion = builder._expansionRoot();
    assert.equal(expansion.constructor, TestSource);
    assert.equal(expansion.parentNode.parentBag.constructor, TestSource);
});

for (const transport of ['json', 'msgpack']) {
    test(`a registered subclass survives the TYTX wire (${transport})`, () => {
        const builder = page();
        const options = { transport };
        const result = sourceBagFromTytx(sourceBagToTytx(builder.source, options), new TestSourceBuilder(), options);
        assert.equal(result.constructor, TestSource);
        assert.ok(branches(result).every((branch) => branch.constructor === TestSource));
        assert.ok(nodes(result).every((node) => node.constructor === TestSourceNode));
    });
}

test('the wire carries __cls on the root only', () => {
    const builder = page();
    const payload = toTytx(builder.source);
    assert.ok(payload.endsWith('::X'));
    const wire = JSON.parse(payload.slice(0, -'::X'.length));
    assert.equal(wire.__cls, 'TestSource');
    assert.ok(wire.rows.every((row) => row[4]?.__cls === undefined));
    const decoded = fromTytx(payload);
    assert.equal(decoded.constructor, TestSource);
    assert.equal(toTytx(decoded), payload);
});
