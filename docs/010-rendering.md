# 010 · Rendering and presentation

Document ID: **GBJ-010**.

<a id="gbj-010-005"></a>

## 005 · Traversal and delivery

`RendererBase` resolves runtime values, dispatches each node to its dialect,
handles tag metadata, recurses and calls `renderedItem`. Concrete renderers own
output representation. Object renderers also own composition and `finalize`.
`preprocess` is an identity hook by default. Reactivity and DOM patching belong
to Gramlot, not this traversal.

| Builder API | Meaning |
| --- | --- |
| `getRenderer(mode)` | Select renderer_mode, using the dialect default when omitted. |
| `materialize(mode, opts)` | Walk and store fragments in materialized[mode], without delivery. |
| `render({mode,target,...opts})` | Materialize and finalize the result. |
| `setRenderTarget(target, mode)` | Register a destination for a mode. |

A string renderer returns text without a destination or delivers it to a function,
`.write()` or `.full()` object. A destination may supply `renderOpts`; explicit
render options take precedence. `target:false` bypasses a registered destination
for string rendering; it is invalid for object renderers. File-path destinations
are not implemented. There is no required TargetWrapper base class in JS.

<a id="gbj-010-010"></a>

## 010 · HTML, SVG and XML

`HtmlBuilder` defaults to HTML, `SvgBuilder` to SVG; every builder has XML mode.
HTML handles escaped text/attributes, raw script/style content, boolean attributes,
pretty output and void elements defined by grammar `_meta.void`. `xml:false`
selects HTML-style void spelling; the default uses a trailing slash.

`includeDatapath:true` adds stable IDs and pointer metadata without creating live
bindings. An authored ID wins. CSS kwargs and style macros belong to HtmlRenderer;
explicit kwargs beat matching declarations in `style`. `html_` escapes HTML
adaptation where a literal native attribute is needed. Keyword escapes follow
Python spelling so exported grammars remain usable.

SVG extends XmlRenderer and specializes attribute spelling. XML empty elements use
paired tags. `docHeader:true` prepends an XML declaration; a string supplies an
explicit header. `pretty` and `depthOffset` control indentation. HTML/SVG nesting
uses registered dialects and the foreignObject/XHTML boundary.

<a id="gbj-010-015"></a>

## 015 · Scalar presentation

```javascript
const page = new HtmlBuilder();
page.data.setItem('price', 1234.5);
page.root.div('^price', {format:'#,##0.00', locale:'it-IT', mask:'€ %s'});
// page.render(): <div>€ 1.234,50</div>
```

`format`, `places`, `locale`, `dtype` and `mask` are consumed Source options for
scalar HTML content. They do not format input values, arbitrary HTML attributes
or the underlying Data. Numbers support decimal, percent, scientific and patterns
such as `0.00`, `#,##0.00`; places selects 0–20 fractional places. Number and TYTX
Decimal values are supported, subject to the host Intl Decimal capability check.

Dates support short/medium/long/full and a bounded LDML token set:
y, yy, yyyy; M, MM, MMM, MMMM; d, dd; EEE, EEEE; H, HH, h, hh; m, mm; s, ss; a.
Use separators between fields. Quoted literals are supported. Unsupported tokens
raise. Typed Date carriers use UTC fields; explicit dtype disambiguates D/H/DH/DHZ.

Locale resolves from the element, then Source ancestors in the declaring scope,
then the host Intl locale. No DOM language or application fallback is consulted.
Mask replaces every `%s` with the formatted text. It is not printf: `%f` remains
literal. Null becomes empty presentation text, so `mask:'[%s]'` yields `[]`.
Ordinary HTML content is escaped after formatting; masks do not inject markup.


## Attribute templates and raw HTML (2026-09-21)

`${name}` interpolation applies only to attributes. A preceding backslash,
`\${name}`, produces literal `${name}` without looking up or consuming `name`.
Use a raw string or escape the backslash in the authoring language.
Node values never interpolate template tokens; Data pointers and resolvers still
resolve normally. This preserves JavaScript template literals in script content.

For HTML output, a node value ending in `::HTML` emits raw markup and drops the
suffix. Ordinary text remains escaped. This marker does not enable templates,
does not sanitize markup and does not change attribute escaping. For example,
`<b>${name}</b>::HTML` emits `<b>${name}</b>` literally.
