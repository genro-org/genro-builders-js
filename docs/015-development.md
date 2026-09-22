# 015 · Repository and development

Document ID: **GBJ-015**.

<a id="gbj-015-005"></a>

## 005 · Source map

```text
src/
  index.js                 public exports
  builder-base.js          grammar ownership, authoring and static lifecycle
  source-bag.js            typed Source, fluent handles and Data paths
  collection.js            portable JSON composition and export
  grammar-loader.js        JSON parsing, inheritance and validation
  utils.js                 shared tag and keyword spelling
  collections/             canonical exported HTML5/SVG and base declarations
  builder/                 HtmlBuilder, SvgBuilder
  renderer/                base, XML, HTML, SVG and scalar presentation
scripts/
  export_collections.py    export through the owning Python builder
tests/                    Node test runner tests (also exercised with Bun)
docs/                      Sphinx developer manual
```

<a id="gbj-015-010"></a>

## 010 · Checks and packaging

Run `npm test` or `bun test tests`. Tests use bundled collections, not optional
files in a developer's temporary directory. Run Sphinx with warnings as errors as
shown in the README. Sphinx reads the version from package.json and uses the
classic Read the Docs theme. Generated files stay under build and are ignored.

With the current Python genro-builders importable, `npm run export:collections`
regenerates base, HTML5 and SVG through `to_grammar()`. Never edit a second native tag
list. Compare the JSON content after regeneration before accepting a change.

`npm pack --dry-run` reviews package contents without publication. Runtime files,
export tooling, README, changelog, Sphinx sources and licensing are packaged.
Tests remain in the source checkout. First-party dependencies remain floating;
no npm/Bun lockfile is maintained. Local artifact validation does not verify that
all required source changes are already published upstream.
