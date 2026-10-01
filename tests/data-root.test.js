// Copyright 2025 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import { Bag } from '@genrojs/bag';
import { BuilderBase, DATA_ROOT, SOURCE_ROOT } from '../src/index.js';
import { declaration, grammarDocument } from './grammar-fixture.js';

class RootPage extends BuilderBase {
    static _name = 'data_root_page';
    static {
        this.defineGrammar(grammarDocument('data-root', {
            root: declaration({ sub_tags: '*' }),
        }));
    }
}

/** Record every event a wrapper subscriber receives. */
function record(builder) {
    const events = [];
    const listen = (o) => events.push({ evt: o.evt, pathlist: o.pathlist });
    builder._dataroot.subscribe('data-root-test', {
        insert: listen, update: listen, delete: listen,
    });
    return events;
}

test('DATA_ROOT has the same value as the Source root name', () => {
    assert.equal(DATA_ROOT, '_root_');
    assert.equal(DATA_ROOT, SOURCE_ROOT);
});

test('builder.data is the _root_ value of a private _dataroot, backrefs on', () => {
    const builder = new RootPage();
    assert.ok(builder._dataroot instanceof Bag);
    assert.notEqual(builder.data, builder._dataroot);
    assert.equal(builder._dataroot.getItem(DATA_ROOT), builder.data);
    assert.equal(builder._dataroot.backref, true);
    assert.equal(builder.data.backref, true);
    assert.deepEqual(builder._dataroot.keys(), [DATA_ROOT]);
});

test('the parent chain of builder.data reaches the wrapper', () => {
    const builder = new RootPage();
    builder.data.setItem('a.b', 1);
    assert.equal(builder.data.parent, builder._dataroot);
    const inner = builder.data.getNode('a').value;
    assert.equal(inner.parent, builder.data);
    assert.equal(inner.parentNode.parentBag, builder.data);
    assert.equal(builder.data.parentNode.parentBag, builder._dataroot);
    assert.equal(builder._dataroot.parent, null);
});

test('a wrapper subscriber receives nested ins/upd_value/del under _root_', () => {
    const builder = new RootPage();
    const events = record(builder);

    builder.data.setItem('a.b', 1);
    builder.data.setItem('a.b', 2);
    builder.data.popNode('a.b');

    assert.deepEqual(events, [
        { evt: 'ins', pathlist: ['_root_'] },
        { evt: 'ins', pathlist: ['_root_', 'a'] },
        { evt: 'upd_value', pathlist: ['_root_', 'a', 'b'] },
        { evt: 'del', pathlist: ['_root_', 'a'] },
    ]);
});

test('the content node is stable across writes and reads', () => {
    const builder = new RootPage();
    const content = builder.data;
    builder.data.setItem('x', 1);
    builder.data.popNode('x');
    assert.equal(builder.data, content);
    assert.equal(builder._dataroot.getItem(DATA_ROOT), content);
});

test('author paths do not include the root segment', () => {
    const builder = new RootPage();
    builder.data.setItem('a.b', 5);
    assert.equal(builder.data.getItem('a.b'), 5);
    assert.equal(builder.data.getItem('_root_.a.b'), null);
    assert.equal(builder._dataroot.getItem('_root_.a.b'), 5);
});

test('sub-builders share the parent content Bag and its wrapper', () => {
    class ChildPage extends BuilderBase {
        static _name = 'data_root_child';
        static { this.defineGrammar(grammarDocument('data-root-child', {
            root: declaration({ sub_tags: '*' }),
        })); }
    }
    BuilderBase.registerBuilder(ChildPage);
    const host = new RootPage();
    const child = host.getSubbuilder(ChildPage._name);
    assert.equal(child.data, host.data);
    assert.equal(child._dataroot, host._dataroot);
    const events = record(host);
    child.data.setItem('shared', 1);
    assert.deepEqual(events, [{ evt: 'ins', pathlist: ['_root_'] }]);
});
