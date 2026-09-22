// Copyright 2025 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import { HtmlBuilder, HtmlRenderer } from '../src/index.js';
import { declaration, grammarDocument } from './grammar-fixture.js';

test('HtmlBuilder bundles the exported HTML5 grammar and renders text by default', () => {
    const builder = new HtmlBuilder();
    const html = builder.root.html({ lang: 'en' });
    html.head().title('A & B');
    const body = html.body();
    body.h1('Hello <world>', { class_: 'title' });
    body.img({ src: 'a&b.png', alt: 'A "quote"' });
    assert.equal(builder.render(), '<html lang="en"><head><title>A &amp; B</title></head><body>'
        + '<h1 class="title">Hello &lt;world&gt;</h1>'
        + '<img src="a&amp;b.png" alt="A &quot;quote&quot;"/></body></html>');
    assert.ok(Object.keys(builder.schema).length > 100);
});

test('HTML mode handles void, raw-text, boolean and pretty HTML5 output', () => {
    const builder = new HtmlBuilder();
    const html = builder.root.html();
    html.head().script('if (a < b && c > d) go();');
    html.body().input({ disabled: true, required: false, 'data-ready': false });
    assert.equal(builder.render({ xml: false, pretty: true }),
        '<html>\n  <head>\n    <script>if (a < b && c > d) go();</script>\n  </head>\n'
        + '  <body>\n    <input disabled data-ready="false">\n  </body>\n</html>\n');
});

test('HtmlRenderer keeps Python CSS adaptations in the HTML dialect', () => {
    const builder = new HtmlBuilder();
    builder.root.div('box', {
        id: 'card', html_width: 320, width: '100px', padding_top: '2rem',
        style: 'color: red; width: 1px', style_aspect_ratio: '16/9',
        rounded: 4, rounded_top: 8, transform_rotate: 15,
        validate_notnull: true, dtype: 'T',
    });
    assert.equal(builder.render(), '<div id="card" width="320" style="color: red; width: 100px; '
        + 'padding-top: 2rem; aspect-ratio: 16/9; border-top-left-radius: 8px; '
        + 'border-top-right-radius: 8px; border-bottom-left-radius: 4px; '
        + 'border-bottom-right-radius: 4px; transform: rotate(15deg)">box</div>');
});

test('malformed explicit style and invalid HTML grammar placement fail clearly', () => {
    const builder = new HtmlBuilder();
    builder.root.div('x', { style: 'broken' });
    assert.throws(() => builder.render(), /malformed style declaration/);
    const document = new HtmlBuilder();
    assert.throws(() => document.root.html().option('x'), /not allowed as child/);
});

test('the declared SVG boundary resolves the bundled registered builder', () => {
    const builder = new HtmlBuilder();
    builder.root.svg({ width: 10 }).circle({ cx: 5, cy: 5, r: 4 });
    assert.equal(
        builder.render(),
        '<svg width="10"><circle cx="5" cy="5" r="4"></circle></svg>',
    );
});

test('HtmlRenderer remains independently reusable with an HtmlBuilder', () => {
    const builder = new HtmlBuilder();
    const renderer = new HtmlRenderer(builder);
    assert.deepEqual(renderer.adaptAttrs({ html_width: 20, width: '10px', checked: true }),
        { width: 20, checked: true, style: 'width: 10px' });
});

test('HtmlBuilder subclasses extend the parsed class grammar', () => {
    class ExtendedHtml extends HtmlBuilder {
        static { this.defineGrammar(grammarDocument('extended-html', {
            fancyBox: declaration({ sub_tags: '*' }),
        })); }
    }
    const builder = new ExtendedHtml();
    builder.root.fancyBox().span('kept');
    assert.equal(builder.render(), '<fancyBox><span>kept</span></fancyBox>');
    assert.ok(builder.schema.html._subSpec instanceof Map);
});


test('explicit CSS overrides style in either attribute order', () => {
    const fallback = {style: 'width: 1px; aspect-ratio: 1/1; color: blue'};
    const explicit = {width: '100px', style_aspect_ratio: '16/9'};
    for (const attrs of [{...fallback, ...explicit}, {...explicit, ...fallback}]) {
        const builder = new HtmlBuilder();
        builder.root.div('x', attrs);
        assert.equal(builder.render(),
            '<div style="width: 100px; aspect-ratio: 16/9; color: blue">x</div>');
    }
});

test('style parsing preserves semicolons inside CSS values', () => {
    const builder = new HtmlBuilder();
    builder.root.div('x', {
        style: 'content: "a;b"; background-image: url("data:image/svg+xml;utf8,a\\;b"); '
            + '--escaped: one\\;two; --fn: outer(inner(a;b)); '
            + 'color: /* keep ; here */ blue; height: 3px; width: 1px',
        width: '100px',
    });
    assert.equal(builder.render(), '<div style="content: &quot;a;b&quot;; '
        + 'background-image: url(&quot;data:image/svg+xml;utf8,a\\;b&quot;); '
        + '--escaped: one\\;two; --fn: outer(inner(a;b)); '
        + 'color: /* keep ; here */ blue; height: 3px; '
        + 'width: 100px">x</div>');
});


test('HTML closing behavior follows grammar metadata, including render-tag aliases', () => {
    class ExtendedHtml extends HtmlBuilder {
        static {
            this.defineGrammar(grammarDocument('html-closing', {
                linebreak: declaration({ sub_tags: '', _meta: { render_tag: 'void-alias', void: true } }),
                emptyText: declaration({ sub_tags: '', _meta: { render_tag: 'span' } }),
            }));
        }
    }
    const builder = new ExtendedHtml();
    builder.root.linebreak();
    builder.root.emptyText();
    assert.equal(builder.render({xml: false}), '<void-alias><span></span>');
    assert.equal(builder.render({xml: true}), '<void-alias/><span></span>');
    assert.equal(builder.schema.br._meta.void, true);
    assert.equal(builder.schema.div._meta?.void, undefined);
});
