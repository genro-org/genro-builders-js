// Copyright 2026 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import { fromTytx } from '@genrojs/tytx';
import { HtmlBuilder } from '../src/index.js';

test('static presentation formats scalar content, consumes options and preserves Data', () => {
    const b = new HtmlBuilder();
    b.data.setItem('price', 1234.5);
    b.root.div('^price', {format:'#,##0.00', locale:'it-IT', mask:'€ %s'});
    b.root.input({value:'^price', format:'#,##0.00', locale:'it-IT'});
    assert.equal(b.render(), '<div>€ 1.234,50</div><input value="1234.5"/>');
    assert.equal(b.data.getItem('price'), 1234.5);
});

test('locale pointers use declaring ancestors and options are read at every render', () => {
    const b = new HtmlBuilder();
    b.data.setItem('settings.language', 'it-IT');
    b.data.setItem('settings.record.price', 1234.5);
    b.data.setItem('pattern', '#,##0.00');
    b.root.div({datapath:'settings', locale:'^.language'})
        .span('^.price', {datapath:'.record', format:'=pattern'});
    assert.equal(b.render(), '<div><span>1.234,50</span></div>');
    b.data.setItem('settings.language', 'en-US');
    assert.equal(b.render(), '<div><span>1,234.50</span></div>');
});

test('temporal formats preserve civil dates and reject unsupported patterns', () => {
    const b = new HtmlBuilder();
    b.data.setItem('day', fromTytx('2026-09-11::D'));
    b.root.div('^day', {format:'dd/MM/yyyy', mask:'Due: %s'});
    assert.equal(b.render(), '<div>Due: 11/09/2026</div>');
    const invalid = new HtmlBuilder();
    invalid.data.setItem('day', fromTytx('2026-09-11::D'));
    invalid.root.div('^day', {format:'YYYY-MM-dd'});
    assert.throws(() => invalid.render(), /Unsupported/);
});

test('masks wrap empty, zero and false values, escape text and do not implement printf', () => {
    const b = new HtmlBuilder();
    b.root.div(null, {mask:'[%s]'});
    b.root.div(0, {mask:'%s / %s'});
    b.root.div(false, {mask:'<b>%s</b>'});
    b.root.div(45, {mask:'€ %.2f'});
    assert.equal(b.render(), '<div>[]</div><div>0 / 0</div><div>&lt;b&gt;false&lt;/b&gt;</div><div>€ %.2f</div>');
});


test('direct Date arguments remain values on roots and child nodes', () => {
    const b = new HtmlBuilder();
    const day = new Date('2026-09-11T00:00:00Z');
    const node = b.root.div(day, {format:'dd/MM/yyyy'});
    assert.strictEqual(node.value, day);
    const parent = b.root.div({id:'parent'});
    const child = parent.span(day, {format:'dd/MM/yyyy'});
    assert.strictEqual(child.value, day);
    b.root.div(Object.assign(Object.create(null), {id:'empty'}));
    assert.equal(b.render(), '<div>11/09/2026</div><div id="parent"><span>11/09/2026</span></div><div id="empty"></div>');
});
