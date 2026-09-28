// Copyright 2025 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import { BuilderBase } from '../src/index.js';
import { declaration, grammarDocument } from './grammar-fixture.js';

class StaticPage extends BuilderBase {
    static {
        this.defineGrammar(grammarDocument('static', {
            root: declaration({ sub_tags: '*' }),
            output: declaration({ sub_tags: '' }),
        }));
    }

    static double({ amount }) { return amount * 2; }

    setup(data) { data.setItem('input', 4); }

    main(root) {
        const frame = root.root({ datapath: 'record' });
        frame.dataSetter({ destination: '.seed', value: 3 });
        frame.dataFormula({ destination: 'result', func: 'double', amount: '=input' });
        frame.output('=result', { node_id: 'answer' });
    }
}

test('builder owns flat data and create computes every data element once', () => {
    const builder = new StaticPage();
    builder.create();

    assert.equal(builder.data.getItem('record.seed'), 3);
    assert.equal(builder.data.getItem('result'), 8);
    assert.equal(builder.runtimeValues(builder.nodeById('answer'))[0], 8);
    assert.equal(builder.nodeById('answer').absDatapath('plain.path'), 'plain.path');
    assert.equal(builder.nodeById('answer').absDatapath('^plain.path'), 'plain.path');
});

test('relative node data access uses the owning builder without a handler', () => {
    const builder = new StaticPage();
    const frame = builder.root.root({ datapath: 'record' });
    const output = frame.output(null, { datapath: '.nested' });

    output.SET('.value', 7);
    assert.equal(builder.data.getItem('record.nested.value'), 7);
    assert.equal(output.GET('.value'), 7);
    assert.equal('handler' in builder, false);
});

test('generic builder exposes static identity and no reactive patch API', () => {
    const builder = new StaticPage();
    const node = builder.root.output('value');

    assert.equal(builder.targetId(node), 'n1');
    assert.equal(builder.targetId(node), 'n1');
    assert.equal(typeof builder.renderNodes, 'undefined');
    assert.equal(typeof builder.wcRequires, 'undefined');
});

test('data logic rejects inline source strings instead of evaluating them', () => {
    const builder = new StaticPage();
    assert.throws(
        () => builder._resolveLogicFunc('({ value }) => value * 2'),
        /not found/,
    );
});

test('static components are instance-owned and compose with loaded grammar', () => {
    class ComponentPage extends BuilderBase {
        static components = ['card'];
        card() {}
        main(root) { root.card({ title: 'hello' }); }
    }
    const classSchema = ComponentPage._classSchema;
    const untouched = new ComponentPage();
    const page = new ComponentPage().loadGrammar(
        grammarDocument('host', { host: declaration({ sub_tags: '*' }) }),
        { replace: true },
    );

    page.create();

    assert.strictEqual(ComponentPage._classSchema, classSchema);
    assert.equal(ComponentPage._classSchema.card, undefined);
    assert.equal(untouched.schema.card, undefined);
    assert.equal(page.schema.host.sub_tags, '*');
    assert.equal(page.schema.card._meta.component, true);
    assert.equal(page.componentMethod('CARD'), 'card');
    assert.equal(page.source.getNodes()[0].nodeTag, 'card');
});

test('templates consume inputs, preserve source and report missing names', () => {
    const builder = new StaticPage();
    builder.data.setItem('width', 120);
    const node = builder.root.output('${label}', { label: '=missing', w: '^width', width: '${w}px' });
    assert.deepEqual(builder.runtimeValues(node), ['${label}', { label: null, width: '120px' }]);
    assert.equal(node.getAttr('w'), '^width');
    builder.data.setItem('width', 200);
    assert.equal(builder.runtimeValues(node)[1].width, '200px');
    assert.throws(() => builder.runtimeValues(builder.root.output(null, {title: '${missing}'})), /Unknown template parameter/);
});

test('data elements keep ${name} in their attributes as written', () => {
    const builder = new StaticPage();
    builder.data.setItem('total', 42);
    const formula = builder.root.dataFormula({ destination: 'msg', func: 'double', script: '`Total: ${total}`', total: '^total' });
    const [, attrs] = builder.runtimeValues(formula);
    assert.equal(attrs.script, '`Total: ${total}`');
    assert.equal(attrs.total, 42);
    const unknown = builder.root.dataFormula({ destination: 'now', func: 'double', script: '`${Date.now()}` ${stamp}' });
    assert.equal(builder.runtimeValues(unknown)[1].script, '`${Date.now()}` ${stamp}');
});

test('direct attribute resolvers use Bag resolution and its cache', async () => {
    const { BagCbResolver } = await import('@jsr/genro__bag');
    let calls = 0;
    const resolver = new BagCbResolver({ callback: () => ++calls, cacheTime: -1 });
    const builder = new StaticPage();
    const node = builder.root.output(null, { title: resolver });
    assert.equal(builder.runtimeValues(node)[1].title, 1);
    assert.equal(builder.runtimeValues(node)[1].title, 1);
    assert.equal(calls, 1);
});

test('data presentation attributes override authored values only for value reads', () => {
    const builder = new StaticPage();
    builder.data.setItem('alarm', 21, { _wdg: { title: 'alarm' }, unit: 'C' });
    assert.deepEqual(builder.runtimeValues(builder.root.output('^alarm', {title:'default'})), [21, {title:'alarm'}]);
    assert.deepEqual(builder.runtimeValues(builder.root.output('^alarm?unit')), ['C', {}]);
    assert.deepEqual(builder.runtimeValues(builder.root.output(null, {title:'^alarm'})), [null, {title:21}]);
    const formula = builder.root.dataFormula({ destination:'result', func:'double', amount:'^alarm' });
    assert.equal(builder.runtimeValues(formula)[1].title, undefined);
});

test('HTML static pointer metadata matches Python without altering default output', async () => {
    const { HtmlBuilder } = await import('../src/index.js');
    const builder = new HtmlBuilder();
    builder.data.setItem('width', 120);
    builder.root.div(null, {w:'^width', width:'${w}px'});
    builder.root.div('literal', {id:'chosen'});
    assert.equal(builder.render(), '<div style="width: 120px"></div><div id="chosen">literal</div>');
    const expected = '<div style="width: 120px" id="n1" data-w-pointer="width"></div><div id="chosen">literal</div>';
    assert.equal(builder.render({includeDatapath:true}), expected);
    assert.equal(builder.render({includeDatapath:true}), expected);
});


test('escaped attribute templates and raw HTML preserve literal node values', async () => {
    const {HtmlBuilder} = await import('../src/index.js');
    const builder = new HtmlBuilder();
    builder.root.div('<b>${name}</b>::HTML');
    builder.root.div('<b>${name}</b>');
    builder.root.script('const text = `${name}`;');
    builder.root.div(null, {title: String.raw`\${missing} ${'${name}'}`, name: 'Mario'});
    const html = builder.render();
    assert.ok(html.includes('<div><b>${name}</b></div>'));
    assert.ok(html.includes('<div>&lt;b&gt;${name}&lt;/b&gt;</div>'));
    assert.ok(html.includes('<script>const text = `${name}`;</script>'));
    assert.ok(html.includes('title="${missing} Mario"'));
    assert.ok(!html.includes(' name='));
    assert.ok(!html.includes('::HTML'));
});
