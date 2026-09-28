# Changelog

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
