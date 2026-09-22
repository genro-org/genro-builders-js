// Copyright 2025 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import {
    BuilderBase, RendererBase, SourceBag,
    sourceBagFromTytx, sourceBagToTytx, sourceTarget,
} from '../src/index.js';
import { declaration, grammarDocument } from './grammar-fixture.js';

class DialectRenderer extends RendererBase {
    static mode = null;
    renderedItem(node, item, _attrs, { tag }) {
        const body = Array.isArray(item) ? item.join('') : (item ?? '');
        return `<${this.mode}:${tag}>${body}</${this.mode}:${tag}>`;
    }
}
class AlphaRenderer extends DialectRenderer { static mode = 'alpha'; }
class BetaRenderer extends DialectRenderer { static mode = 'beta'; }

class AlphaBuilder extends BuilderBase {
    static _name = 'subtest_alpha'; static _defaultRenderMode = 'alpha';
    static { this.defineGrammar(grammarDocument('subtest-alpha', {
        alpha: declaration({ sub_tags: '*' }),
        toBeta: declaration({ sub_tags: '*', _meta: { subbuilder: 'subtest_beta' } }),
        missing: declaration({ sub_tags: '*', _meta: { subbuilder: 'subtest_missing' } }),
        referenced: declaration({ sub_tags: '*', _meta: { subbuilder: 'app:grammar' } }),
    })); }
    get renderer_alpha() { return new AlphaRenderer(this); }
}
class BetaBuilder extends BuilderBase {
    static _name = 'subtest_beta'; static _defaultRenderMode = 'beta';
    static { this.defineGrammar(grammarDocument('subtest-beta', {
        beta: declaration({ sub_tags: '*' }),
        toAlpha: declaration({ sub_tags: '*', _meta: { subbuilder: 'subtest_alpha' } }),
    })); }
    get renderer_beta() { return new BetaRenderer(this); }
}
BuilderBase.registerBuilder(AlphaBuilder);
BuilderBase.registerBuilder(BetaBuilder);

test('named subbuilders switch fluent grammar and default renderer through nested boundaries', () => {
    const builder = new AlphaBuilder();
    builder.data.setItem('shared.message', 'from alpha');
    const outer = builder.root.alpha();
    const betaBoundary = outer.toBeta('promoted');
    assert.ok(sourceTarget(betaBoundary).builder instanceof BetaBuilder);
    const betaValue = betaBoundary.beta('=shared.message');
    const beta = betaBoundary.beta();
    const alphaBoundary = beta.toAlpha();
    alphaBoundary.alpha('A');

    assert.equal(builder.getSubbuilder('subtest_beta'), sourceTarget(betaBoundary).builder);
    assert.equal(sourceTarget(betaBoundary).builder.data, builder.data);
    assert.equal(sourceTarget(alphaBoundary).builder.data, builder.data);
    assert.equal(sourceTarget(betaValue).getRelativeData('shared.message'), 'from alpha');
    assert.equal(
        builder.render(),
        '<alpha:alpha><beta:toBeta><beta:beta>from alpha</beta:beta><beta:beta><alpha:toAlpha>'
        + '<alpha:alpha>A</alpha:alpha></alpha:toAlpha></beta:beta></beta:toBeta></alpha:alpha>',
    );
});

test('registry rejects a different class under an existing canonical name', () => {
    class ConflictingAlpha extends BuilderBase { static _name = 'subtest_alpha'; }
    assert.throws(() => BuilderBase.registerBuilder(ConflictingAlpha), /already registered/);
    assert.equal(BuilderBase.getBuilderClass('subtest_alpha'), AlphaBuilder);
    assert.equal(BuilderBase.registerBuilder(AlphaBuilder), AlphaBuilder);
});

test('document identity and detached identity stay owned by the root builder', () => {
    const builder = new AlphaBuilder();
    const boundary = builder.root.toBeta({ node_id: 'boundary', datapath: 'record' });
    assert.equal(builder.targetId(sourceTarget(boundary)), 'n1');
    const child = boundary.beta();
    assert.equal(sourceTarget(child).absDatapath('#boundary.name'), 'record.name');
    assert.throws(() => boundary.beta({ node_id: 'boundary' }), /Duplicate node_id/);
    assert.equal(sourceTarget(boundary).value.getNodes().length, 1);

    const mounted = sourceTarget(boundary).builder;
    const detached = mounted._expansionRoot();
    const detachedNode = sourceTarget(mounted.wrapSource(detached).beta());
    assert.equal(detachedNode.builder.targetId(detachedNode), null);
});

test('prebuilt branches are rebound deeply with the same ownership plan', () => {
    const host = new AlphaBuilder();
    const betaBuilder = host.getSubbuilder('subtest_beta');
    const branch = new SourceBag(null, betaBuilder);
    const beta = betaBuilder.wrapSource(branch).beta();
    beta.toAlpha().alpha('nested');
    const boundary = host.root.toBeta(branch);

    const mountedBranch = sourceTarget(boundary).value;
    const betaNode = mountedBranch.getNodes()[0];
    const alphaBoundary = betaNode.value.getNodes()[0];
    const alphaNode = alphaBoundary.value.getNodes()[0];
    assert.equal(mountedBranch._builder, betaBuilder);
    assert.equal(betaNode.builder, betaBuilder);
    assert.ok(alphaBoundary.builder instanceof AlphaBuilder);
    assert.equal(alphaNode.builder, alphaBoundary.builder);
    assert.equal(alphaBoundary.builder.data, host.data);
});

test('insertion subscribers see complete ownership on the original node class', () => {
    const host = new AlphaBuilder();
    const original = new AlphaBuilder();
    const branch = new SourceBag(null, original);
    const originalNode = sourceTarget(original.wrapSource(branch).alpha('prebuilt'));
    const observations = [];
    host.source.subscribe('ownership', { insert: ({ node }) => {
        observations.push([node, node.value]);
    } });

    const boundary = sourceTarget(host.root.toBeta(branch));
    const betaBuilder = boundary.builder;
    assert.equal(boundary.constructor, originalNode.constructor);
    assert.equal(boundary.constructor.name, 'SourceBagNode');
    assert.equal(observations.length, 1);
    for (const [node, value] of observations) {
        assert.equal(node.builder, betaBuilder);
        assert.equal(value._builder, betaBuilder);
        assert.equal(value.getNodes()[0].builder, betaBuilder);
    }
});

test('reentrant insert publication restores ownership context at every level', () => {
    const host = new AlphaBuilder();
    const seen = [];
    host.source.subscribe('nested-ownership', { insert: ({ node }) => {
        seen.push([node.nodeTag, node.builder, host.source._insertingBuilder]);
        if (node.nodeTag === 'toBeta') host.root.alpha('nested');
        seen.push([`${node.nodeTag}:after`, node.builder, host.source._insertingBuilder]);
    } });

    const boundary = sourceTarget(host.root.toBeta());
    assert.deepEqual(seen, [
        ['toBeta', boundary.builder, boundary.builder],
        ['alpha', host, host],
        ['alpha:after', host, host],
        ['toBeta:after', boundary.builder, boundary.builder],
    ]);
    assert.equal(host.source._insertingBuilder, null);
    const nested = host.source.getNodes().find(node => node.nodeTag === 'alpha');
    assert.equal(boundary.constructor, nested.constructor);
});

test('failed insertion restores branch ownership while subscriber failure preserves committed ownership', () => {
    const rejectingHost = new AlphaBuilder();
    const original = new AlphaBuilder();
    const branch = new SourceBag(null, original);
    const originalNode = sourceTarget(original.wrapSource(branch).alpha('prebuilt'));
    assert.throws(() => rejectingHost.root.toBeta(branch, {node_label: '#missing'}),
        /Cannot create new node with #n syntax/);
    assert.equal(rejectingHost.source.getNodes().length, 0);
    assert.equal(branch._builder, original);
    assert.equal(originalNode.builder, original);
    assert.equal(rejectingHost.source._insertingBuilder, null);

    const throwingHost = new AlphaBuilder();
    throwingHost.source.subscribe('throwing', { insert: ({ node }) => {
        assert.ok(node.builder instanceof BetaBuilder);
        throw new Error('subscriber failed');
    } });
    assert.throws(() => throwingHost.root.toBeta(), /subscriber failed/);
    assert.ok(throwingHost.source.getNodes()[0].builder instanceof BetaBuilder);
    assert.equal(throwingHost.source._insertingBuilder, null);
});

test('unknown and reference subbuilders fail before source insertion or scalar promotion', () => {
    const builder = new AlphaBuilder();
    const parent = builder.root.alpha('kept');
    assert.throws(() => parent.missing(), /No builder registered/);
    assert.equal(sourceTarget(parent).value, 'kept');
    assert.throws(() => parent.referenced({ app: {} }), /runtime subbuilder reference/);
    assert.equal(sourceTarget(parent).value, 'kept');
    assert.equal(builder.source.getNodes().length, 1);
});

test('typed transport rebind reconstructs named dialect ownership without a wire change', () => {
    const authored = new AlphaBuilder();
    authored.root.alpha().toBeta().beta().toAlpha().alpha('round trip');
    const payload = sourceBagToTytx(authored.source);
    const host = new AlphaBuilder();
    const source = sourceBagFromTytx(payload, host);

    const alpha = source.getNodes()[0];
    const betaBoundary = alpha.value.getNodes()[0];
    const beta = betaBoundary.value.getNodes()[0];
    const alphaBoundary = beta.value.getNodes()[0];
    assert.equal(alpha.builder, host);
    assert.ok(betaBoundary.builder instanceof BetaBuilder);
    assert.equal(beta.builder, betaBoundary.builder);
    assert.ok(alphaBoundary.builder instanceof AlphaBuilder);
    assert.notEqual(alphaBoundary.builder, host);
    assert.equal(betaBoundary.builder.data, host.data);
    assert.equal(alphaBoundary.builder.data, host.data);
});

test('transport rebind validates every boundary before changing ownership', () => {
    const original = new AlphaBuilder();
    const source = new SourceBag(null, original);
    const child = new SourceBag(null, original);
    source.setItem('bad', child, { _meta: { subbuilder: 'subtest_missing' } },
        '>', false, true, null, false, true, null, 'missing');
    const boundary = source.node('bad');
    assert.throws(() => source.bindBuilder(new AlphaBuilder()), /No builder registered/);
    assert.equal(source._builder, original);
    assert.equal(boundary._builder, original);
    assert.equal(child._builder, original);
});


test('validation and ID lookup preserve the mounted node dialect', () => {
    class RequiredChild extends BuilderBase {
        static _name = 'subtest_required';
        static { this.defineGrammar(grammarDocument('required', {
            mount: declaration({ sub_tags: 'leaf[1]' }),
            panel: declaration({ sub_tags: 'leaf[1]' }),
            leaf: declaration({ sub_tags: '' }),
        })); }
    }
    BuilderBase.registerBuilder(RequiredChild);
    class Host extends BuilderBase {
        static { this.defineGrammar(grammarDocument('required-host', {
            mount: declaration({ sub_tags: '*', _meta: { subbuilder: 'subtest_required' } }),
            panel: declaration({ sub_tags: '' }),
        })); }
    }
    const host = new Host();
    const boundary = host.root.mount({ node_label: 'boundary' });
    const panel = boundary.panel({ node_label: 'panel', node_id: 'panel' });
    // The structural boundary is not checked as the child dialect's ordinary mount.
    assert.deepEqual(host.validateSource(), [['boundary.panel', ['leaf']]]);
    const lookedUp = host.nodeById('panel');
    assert.strictEqual(lookedUp, panel);
    lookedUp.leaf('satisfied');
    assert.deepEqual(host.validateSource(), []);
    assert.equal(sourceTarget(lookedUp).value.getNodes()[0].builder, sourceTarget(panel).builder);
});


test('inserting a SourceBag retains Bag-owned parent links and nested events', () => {
    const builder = new AlphaBuilder();
    const branch = new SourceBag(null, builder);
    const parent = sourceTarget(builder.root.alpha(branch));
    assert.strictEqual(branch.parentNode, parent);
    assert.strictEqual(branch.root, builder.source.root);
    const events = [];
    builder.source.subscribe('nested-authoring', {any: event => events.push(event)});
    const child = sourceTarget(builder.wrapSource(parent).alpha('first'));
    assert.strictEqual(events.at(-1).node, child);
    assert.equal(events.at(-1).evt, 'ins');
    child.setValue('second');
    assert.strictEqual(events.at(-1).node, child);
    assert.equal(events.at(-1).evt, 'upd_value');
    builder.source.unsubscribe('nested-authoring', {any: true});
});


test('insertion subscribers see subbuilder ownership through native nodeClass construction', () => {
    const builder = new AlphaBuilder();
    const seen = [];
    builder.source.subscribe('ownership', {insert: ({node}) => {
        seen.push({node, builder: node.builder});
    }});
    const boundary = builder.root.toBeta();
    assert.equal(seen.length, 1);
    assert.ok(seen[0].builder instanceof BetaBuilder);
    assert.equal(seen[0].node, sourceTarget(boundary));
    assert.equal(seen[0].builder, sourceTarget(boundary).builder);
    const nested = boundary.beta('nested');
    assert.equal(sourceTarget(nested).builder, seen[0].builder);
});
