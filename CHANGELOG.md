# Changelog

## 0.4.2 — 2026-10-04

- Hand-written type declarations with JSDoc in `src/index.d.ts`, referenced
  from `src/index.js` with `@ts-self-types`. No runtime change.
- Bag dependency raised to `^0.10.3`, the first version with its own type
  declarations.

## 0.4.1 — 2026-10-01

- Published on npm as `@genrojs/builders`, alongside JSR `@genro/builders`;
  `publish.yml` releases a version tag to both registries.
- Bag and TYTX are imported as `@genrojs/bag` (`^0.10.1`) and `@genrojs/tytx`
  (`^0.16.1`); `jsr.json` maps them to `jsr:@genro/bag` and `jsr:@genro/tytx`.
  The `@jsr/genro__*` aliases and the `.npmrc` registry line are gone.
- Repository URLs point to `genro-org/genro-builders-js`.

## 0.4.0 — 2026-09-29

- Contract change: a document applied after another (`defineGrammar` on a
  subclass, `loadGrammar` without `replace`) replaces, entirely, every element
  and abstract entry it names; it no longer merges parameters, `sub_tags`,
  `parent_tags`, `inherits_from` or other keys with the earlier entry. Entries
  not named are inherited unchanged. `grammar` metadata still merges. (#10)
- The datastore has a stable root, as the Source: a private wrapper
  `_dataroot` with the content node `_root_` (`DATA_ROOT`, exported).
  `builder.data` stays the content Bag, so author paths do not change.
  Sub-builders share the content and the wrapper; the builder exposes no
  subscription. Same structure as genro-builders 0.27.0. (#11)

## 0.3.1 — 2026-09-28

- Depend on @genro/bag ^0.10.0.

## 0.3.0 — 2026-09-28

- A builder declares the SourceBag class of its Source in the static attribute
  `_sourceClass` (default `SourceBag`), as genro-builders `_source_class`. It
  is used for `_sourceroot`, `source` and the component expansion root.
- A scalar node promoted to a branch gets the class of its parent bag, as in
  Python; before, the promotion always created a `SourceBag`.

## 0.2.1 — 2026-09-28

- Exempt Bag and TYTX from the JSR minimum dependency age by exact name; the
  wildcard patterns do not match them. First JSR publication of the 0.2 line.

## 0.2.0 — 2026-09-28

- Contract change: SourceBag has no SOURCE suffix. A Source travels as `::X`
  with `__cls: "SourceBag"` on the root and on branches whose class differs
  from the parent's, as in genro-builders 0.24.0.
- Depend on Bag 0.9.0 and TYTX 0.16.0 from JSR; publish as `@genro/builders`.
- Keep `${name}` literal in the attributes of data elements.
- Commit `package-lock.json` and run the test suite in CI on Node 22.

## 0.1.3 — 2026-09-21 (local, unreleased)

- Restrict template interpolation to attributes and support backslash-escaped tokens.
- Preserve node-value templates and restore terminal ::HTML raw markup in HTML output.
- Match Python 0.23.4 for this contract.

## 0.1.2 — 2026-09-21 (local, unreleased)

- Compose JSON grammars through Collection with additive updates and null preservation.
- Preserve executable component declarations during grammar updates.
- Remove recipes and extra generic hooks absent from the Python builder.
- Document the shared collection contract and remaining Python differences.

## 0.1.1 — 2026-09-21 (local, unreleased)

- Consolidate JSON grammar authoring, typed Source transport and static HTML/SVG/XML.
- Correct fixed tuple validation and direct Date authoring.
- Resolve static templates and synchronous direct resolvers; carry Data _wdg attributes.
- Add includeDatapath and format/mask scalar HTML presentation from the existing PoC.
- Review responsibility boundaries, comments and known Python differences.
- Add a Sphinx developer manual; eliminate the temporary-file-dependent grammar test.

First recorded local version review; no published 0.1.0 history is asserted.

## Local correction, version unchanged (2026-09-21)

Removed generic recipes and additional convenience/lifecycle/renderer hooks absent
from Python. Exported the base grammar from Python and rejected unsupported
Callable generic descriptors. See GBJ-025 for the source responsibility audit.
This supersedes architectural closure implied by the earlier local review.
