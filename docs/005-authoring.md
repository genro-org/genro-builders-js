# 005 · Authoring and grammar

Document ID: **GBJ-005**.

<a id="gbj-005-005"></a>

## 005 · Ownership

`BuilderBase` owns a JSON grammar, one Data Bag, a Source tree and the
create/render lifecycle. `SourceBag` and `SourceBagNode` extend Bag types with
builder ownership, Data paths and authoring access. `builder.source` is the raw
SourceBag; `builder.root` is its stable fluent Proxy. Ordinary Bags remain Data,
not an alternate typed Source representation.

`root.div('text', {id:'message'})` supplies a value and attributes.
`root.div({id:'message'})` supplies only attributes. Only plain records, including
null-prototype records, are interpreted as attribute dictionaries. Dates and
other class instances remain values. Chaining `root.div().span('text')` authors
children. Node API names take precedence over grammar names; the dialect prefix
(e.g. `html_label`) escapes a collision. On a SourceBag, grammar names win.

<a id="gbj-005-010"></a>

## 010 · One grammar format

`BuilderClass.defineGrammar(document)` declares the class grammar in a static
block. `builder.loadGrammar(document, {replace:false})` loads an instance grammar.
Both require the `builder_grammar` 1.1 document envelope with
`document_format`, `grammar`, `abstracts` and `elements`. No shorthand schema or
JavaScript decorator API is supplied. The bundled JSON documents are working
examples of the format; do not maintain duplicate native tag lists.

Both compose through `Collection`, in order, earlier document first. The rule is
per entry: an element or abstract named by a later document replaces the earlier
entry entirely (parameters, `sub_tags`, `parent_tags`, `inherits_from`, `ns`,
`doc`, `_meta`, `node_label`, `collection_key`). Nothing of the earlier entry
survives, so a dialect can own an element with its own signature, for example
`dataSetter(destination_path, value=None, **attr)` instead of the generic one.
Elements and abstracts the later document does not name are inherited unchanged.
`grammar` metadata is still merged key by key; a null value keeps the earlier one.
`defineGrammar` applies the rule along the class chain, parent first, and
`loadGrammar` applies it to the instance grammar. `replace:true` retains its
existing whole-grammar reset meaning.

`new Collection(document).update(extension).toDocument()` exposes composition and
exports an independent JSON object in the same format. It owns neither Source nor
renderers. The builder validates/compiles the result before publishing any change.
See [collection examples](030-collections.md).

Names are case-insensitive for dispatch and case-only collisions are rejected.
Loading does not rename the builder instance. Validation checks signatures, types,
parent placement and maximum child counts during authoring. `validateSource()`
reports missing minimum counts explicitly; rendering does not imply validation.

`registerBuilder(Class)` binds a dialect name to a BuilderBase subclass;
`getBuilderClass(name)` looks it up. This registry selects executable dialect
classes, not a second grammar declaration format. Named subbuilders share the
host Data Bag and render with their own dialect. HTML/SVG are registered by the
package entry point; runtime `kwarg:attr` references are not supported.

<a id="gbj-005-015"></a>

## 015 · Data and lifecycle

Subclass `setup(data)` and `main(root)`, then call `create()`. Creation runs setup,
component declaration resolution, main, then data-elements in document order once.
`dataSetter({destination,value})` writes Data, `dataFormula({destination,func,...})`
computes a value and `dataController({func,...})` runs a side effect. A function
receives a bindings object; controllers additionally receive the Source node first.
Named logic resolves static methods on dataLogic sources. Arbitrary code strings
are not evaluated.

The Data Bag is the content of a private wrapper, as the Source is: `_dataroot`
holds one node `_root_` (`DATA_ROOT`, the same value as `SOURCE_ROOT`) and
`builder.data` is that node's value, with backrefs on. Author paths never include
`_root_`. The content node is never replaced, and sub-builders share the parent's
content Bag and wrapper. The builder has no subscription API: a consumer that
carries Data out of the builder subscribes once on `_dataroot` and receives nested
`ins`/`upd_value`/`del` events with a pathlist starting with `_root_`.

Both `^path` and `=path` read Data during static rendering; neither subscribes.
Relative paths use Source datapath scopes. Symbolic anchors include #FORM, #ANCHOR
and node IDs. `GET`, `SET`, `PUT`, `FIRE` delegate to Bag access/event semantics.
Templates `${name}` consume their resolved input attributes; null becomes empty
text and missing inputs raise. Direct synchronous BagResolvers use Bag resolution
and caching. `_wdg` on a Data value read overrides authored attributes, excluding
data-elements and attribute-path reads. No mask formatting occurs in data logic.

Containers listed in `static containers` call same-name methods while authoring.
Components listed in `static components` call same-name methods during rendering
on a temporary root; each expansion must produce one tree. This existing component
mechanism does not settle the separately deferred recipe API.

<a id="gbj-005-020"></a>

## 020 · Typed transport

`sourceBagToTytx(source, {transport:'json'})` and
`sourceBagFromTytx(payload, builder, {transport:'json'})` delegate to TYTX.
Use `msgpack` for the other checked transport. SourceBag has no suffix of its own:
it travels as `::X` and is registered in the TYTX subtype dictionary of `X`
under the name `SourceBag`. The root payload carries `__cls: "SourceBag"`; a
branch carries `__cls` only when its class differs from its parent's. Decoding requires SourceBag and binds runtime builder
ownership in place; it does not convert ordinary Bags into Source.

<a id="gbj-005-025"></a>

## 025 · Source class

The builder declares the SourceBag class of its Source in the static
attribute `_sourceClass`. The default is `SourceBag`. The Source declares the
class of its nodes in its `nodeClass` getter (`SourceBagNode` for
`SourceBag`). This is the legacy GenroPy pair `domSrcFactory` / node class.
Python uses the same name in snake_case: `_source_class`.

```js
import { getSubtypeDict, setSubtypeDict } from '@genrojs/tytx';
import { HtmlBuilder, SourceBag, SourceBagNode } from '@genro/builders';

class PageNode extends SourceBagNode {}
class PageSource extends SourceBag {
    get nodeClass() { return PageNode; }
}
// Only needed for the TYTX wire: "::X" with __cls "PageSource".
setSubtypeDict('X', { ...getSubtypeDict('X'), PageSource });

class CustomerPage extends HtmlBuilder {
    static _sourceClass = PageSource;
    main(root) { root.html().body().h1('Customer page'); }
}
```

- `new _sourceClass(null, builder)` is called for `_sourceroot`, for `source`
  under `_root_` and for the component expansion root. A subclass keeps the
  SourceBag constructor signature.
- A branch created while authoring, including a scalar node promoted to a
  branch, is an instance of the class of its parent bag, as in Python.
- On the TYTX wire the Source travels as `::X` with `__cls` set to the name
  under which its class is registered in the subtype dictionary of `X`. An
  unregistered subclass cannot be serialized.
