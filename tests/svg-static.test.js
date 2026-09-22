// Copyright 2025 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import { HtmlBuilder, SvgBuilder, svgAttributes } from '../src/index.js';

test('HTML renders nested SVG with SVG spelling, case, and escaping', () => {
    const page = new HtmlBuilder();
    const svg = page.root.html().body().svg({
        xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 20 20', focusable: false,
    });
    svg.linearGradient({ id: 'a&b' }).stop({ offset: '50%', stop_color: 'red' });
    svg.circle({ cx: 10, cy: 10, r: 8, stroke_width: 2, title: '"<&' });

    assert.equal(
        page.render(),
        '<html><body><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" focusable="false">'
        + '<linearGradient id="a&amp;b"><stop offset="50%" stop-color="red"></stop></linearGradient>'
        + '<circle cx="10" cy="10" r="8" stroke-width="2" title="&quot;&lt;&amp;"></circle>'
        + '</svg></body></html>',
    );
});

test('SVG renders HTML through a namespace-correct foreignObject boundary', () => {
    const image = new SvgBuilder();
    const svg = image.root.svg({ xmlns: 'http://www.w3.org/2000/svg', width: 40 });
    svg.html({ width: 30 }).div('A & B', { class_: 'note', color: 'red' });

    assert.equal(
        image.render(),
        '<svg xmlns="http://www.w3.org/2000/svg" width="40">'
        + '<foreignObject width="30" xmlns="http://www.w3.org/2000/svg">'
        + '<div xmlns="http://www.w3.org/1999/xhtml" class="note" style="color: red">A &amp; B</div>'
        + '</foreignObject></svg>',
    );
});

test('shared SVG attribute adaptation stays pure and preserves namespace author forms', () => {
    const attrs = { stroke_width: 2, viewBox: '0 0 1 1', xmlns_xlink: 'urn:xlink' };
    assert.deepEqual(svgAttributes(attrs), {
        'stroke-width': 2, viewBox: '0 0 1 1', xmlns_xlink: 'urn:xlink',
    });
    assert.deepEqual(attrs, { stroke_width: 2, viewBox: '0 0 1 1', xmlns_xlink: 'urn:xlink' });
});

test('an explicit namespace on the first HTML child overrides the boundary default', () => {
    const image = new SvgBuilder();
    image.root.svg().html().div('custom', { xmlns: 'urn:custom' });
    assert.match(image.render(), /<div xmlns="urn:custom">custom<\/div>/);
});


test('SVG preserves scalar content and uses shared XML empty-element and attribute output', () => {
    const image = new SvgBuilder();
    const svg = image.root.svg({xmlns: 'http://www.w3.org/2000/svg', xmlns_xlink: 'urn:xlink'});
    svg.metadata('license <&>');
    svg.rect({stroke_width: 2, focusable: false, 'data-enabled': true});
    assert.equal(image.render(),
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="urn:xlink">'
        + '<metadata>license &lt;&amp;&gt;</metadata>'
        + '<rect stroke-width="2" focusable="false" data-enabled="true"></rect></svg>');
});

test('SVG adds an XML declaration only when explicitly requested for the document', () => {
    const image = new SvgBuilder();
    image.root.svg().metadata('license');
    const fragment = '<svg><metadata>license</metadata></svg>';
    assert.equal(image.render(), fragment);
    assert.equal(image.render({docHeader: true}),
        "<?xml version='1.0' encoding='UTF-8'?>" + fragment);
    assert.equal(image.render({docHeader: '<!-- generated -->'}), '<!-- generated -->' + fragment);

    const page = new HtmlBuilder();
    page.root.html().body().svg().metadata('embedded');
    assert.equal(page.render(), '<html><body><svg><metadata>embedded</metadata></svg></body></html>');
});
