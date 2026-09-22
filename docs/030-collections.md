# 030 · Collections

Document ID: **GBJ-030**.

A Collection contains a portable grammar document and its metadata. It combines
additional declarations before the builder compiles the grammar. It does not own
Source, Data, rendering, subscriptions or a registry of loaded documents.

<a id="gbj-030-005"></a>

## 005 · Partial declarations

The envelope is unchanged. Only declarations inside abstracts/elements may omit
fields. For example, this extension adds metadata to div without repeating HTML:

```json
{
  "document_format": {"name": "builder_grammar", "version": "1.1"},
  "grammar": {"name": "application", "version": null, "title": null, "description": null},
  "abstracts": {},
  "elements": {"div": {"_meta": {"feature": "label"}}}
}
```

This declares metadata; it does not implement a labeling capability.

<a id="gbj-030-010"></a>

## 010 · Composition

- Missing or null declaration fields leave the earlier value unchanged.
- Non-null scalar values update fields. Empty strings remain explicit values.
- sub_tags, parent_tags and inherits_from combine named entries in order.
  A repeated child tag updates its cardinality; untouched tags remain.
- Signature parameters combine by name. Each supplied parameter is a complete
  descriptor, including its type/default information; no parameter is removed.
- Nested metadata objects merge; other arrays replace the previous array value.
- Current metadata lives in grammar. New author/license fields are not introduced.
- There are no removal methods/markers or generated HTML documentation in this step.

The existing full-grammar replace loading option remains explicit. Loading an
invalid composition does not publish a new Collection or schema. Exported JSON
and input documents are independent copies, not writable aliases of internal state.

Exporters continue to emit complete declarations. They need no migration because
null leaves previous fields unchanged. Full declarations and partial additions use
one format and one composition path.

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

- An existing sub_tags="*" remains "*" when later collections add bare child
  names such as span. Combining the wildcard with cardinality restrictions remains
  undecided and is rejected; malformed incoming rules are not silently ignored.
- Python runtime include_components rendering already fails to find an
  instance-only component method (confirmed before these changes). Declaration
  preservation is checked here; that renderer defect is not repaired in this port.
- This is JSON collection composition. Arbitrary Python types/callable validators
  remain outside the portable grammar loader's supported annotation vocabulary.
