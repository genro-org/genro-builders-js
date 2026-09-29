# 030 · Collections

Document ID: **GBJ-030**.

A Collection contains a portable grammar document and its metadata. It combines
additional declarations before the builder compiles the grammar. It does not own
Source, Data, rendering, subscriptions or a registry of loaded documents.

<a id="gbj-030-005"></a>

## 005 · Composition rule

A Collection contains one document and composes later documents onto it with
`update`. The rule is per entry, and it is the same in genro-builders (Python):

- An element or abstract named by a later document replaces the earlier entry
  entirely: parameters, sub_tags, parent_tags, inherits_from, ns, doc, _meta,
  node_label, collection_key. Nothing of the earlier entry survives.
- Elements and abstracts the later document does not name are inherited unchanged.
- `grammar` metadata is merged key by key; a null value keeps the earlier one.
- A null entry (`"div": null`) leaves the earlier entry unchanged.

For example, this document replaces div; the earlier div keeps nothing:

```json
{
  "document_format": {"name": "builder_grammar", "version": "1.1"},
  "grammar": {"name": "application", "version": null, "title": null, "description": null},
  "abstracts": {},
  "elements": {"div": {"sub_tags": "span", "_meta": {"feature": "label"}}}
}
```

Rationale: a dialect extending HtmlBuilder must own the data-elements with its own
signatures. With merging, the required `destination` of the generic `dataSetter`
would survive in a dialect that declares `destination_path`.

<a id="gbj-030-010"></a>

## 010 · Validation and export

- Empty strings remain explicit values, including `sub_tags: ""` for no children.
- There are no removal methods or markers.
- The compiled result is validated by the builder (duplicate names, parameters,
  cardinalities, inheritance) before it is published.
- Loading an invalid composition does not publish a new Collection or schema.
  Exported JSON and input documents are independent copies, not writable aliases
  of internal state.
- The full-grammar `replace: true` loading option remains explicit.

Shared fixtures for this rule are in `tests/fixtures/grammar-replace/`.

<a id="gbj-030-015"></a>

## 015 · JavaScript API

```javascript
import {Collection, HtmlBuilder} from 'genro-builders-js';

const collection = new Collection(baseDocument);
collection.update(extensionDocument);
const combinedDocument = collection.toDocument();

const builder = new HtmlBuilder();
builder.loadGrammar(extensionDocument);
```

Collection.update composes JSON data; loadGrammar additionally validates and
compiles it. Class defineGrammar uses the same composition, including successive
calls on the same class. Child class changes do not mutate parent class grammar.

## Open points

- Python runtime include_components rendering already fails to find an
  instance-only component method (confirmed before these changes). Declaration
  preservation is checked here; that renderer defect is not repaired in this port.
