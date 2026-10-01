# genro-builders-js

Build typed Source trees from JSON grammars and render static HTML, SVG or XML.
The generic renderer also supports dialect-defined object output. This package
has no DOM, browser subscriptions, server or database dependencies.

Version **0.4.1** is published on npm and JSR with the Bag 0.10 contract. Python parity is bounded by
[documented differences](docs/020-python-differences.md). Recipes are not implemented.
A builder declares the SourceBag class of its Source in `static _sourceClass`
([Source class](docs/005-authoring.md#gbj-005-025)).

```js
import { HtmlBuilder } from '@genro/builders';

const page = new HtmlBuilder();
page.data.setItem('price', 1234.5);
const body = page.root.html().body();
body.h1('Hello');
body.div('^price', {format: '#,##0.00', locale: 'it-IT', mask: '€ %s'});
const html = page.render();
```

## Install and verify

The same package is published on two registries:

- npm: `npm install @genrojs/builders`, then import from `@genrojs/builders`;
- JSR: `npx jsr add @genro/builders` (or `bunx jsr add`), then import from
  `@genro/builders`.

From a local checkout, run `npm ci` and `npm test`.
Node.js 22 or later and Bun are the supported server runtimes. First-party
dependencies use compatible caret ranges; the committed `package-lock.json`
fixes the versions CI installs.
The source imports Bag and TYTX as `@genrojs/bag` and `@genrojs/tytx`, the npm
names; `jsr.json` maps them to `jsr:@genro/bag` and `jsr:@genro/tytx`. Each
registry's package therefore depends on one Bag class and one TYTX registry
instance from the same registry.

Deno publication keeps a 24-hour cooldown for external dependencies and exempts
`jsr:@genro/*` and `npm:@genrojs/*` to permit verified sequential releases.

## Documentation

- [Partial collection composition](docs/030-collections.md)
- [Authoring, grammar and API](docs/005-authoring.md)
- [Rendering and presentation](docs/010-rendering.md)
- [Repository map and development](docs/015-development.md)
- [Python differences and open points](docs/020-python-differences.md)
- [0.1.2 review record](docs/025-review.md)

Build the Sphinx manual locally:

```sh
python -m pip install -r docs/requirements.txt
python -m sphinx -W --keep-going -n -b html docs build/docs
```

The manual uses the classic Read the Docs theme. No hosting is configured or
implied. See [CHANGELOG](CHANGELOG.md) for the local version change.

Copyright 2025–2026 Softwell S.r.l. Apache-2.0; see LICENSE and NOTICE.


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
