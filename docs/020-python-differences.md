# 020 · Python differences and open points

Document ID: **GBJ-020**. Reviewed: **2026-09-21**.

<a id="gbj-020-005"></a>

## 005 · Explicit differences

| Area | Python | JavaScript / decision |
| --- | --- | --- |
| Grammar | Decorators or JSON | JSON 1.1; agreed declaration adaptation. |
| Arguments | Named kwargs | Attribute record; functions receive a bindings object. |
| Formatting | Percent masks on Data reads | Source format + mask; approved. Python backport is separate. |
| Text conversion | Python string representation | JS representation, e.g. true instead of True; locale/rounding differences documented. |
| Destinations | TargetWrapper base class | renderOpts/full contract without a base class; temporarily accepted. |
| Files | Path targets and rendered_target | Not implemented in portable JS. |
| Resolvers | Synchronous rendering | Synchronous resolvers work; Promise consumption has no agreed render contract. |
| Validators | Python types and regular expressions | Explicit bounded mappings; Python-only types/regex rejected. |
| Dialects | YAML, CSS, XSD, XSLT and others | Current bundle: HTML/SVG and generic XML; other ports not implied. |
| Runtime dialect references | kwarg:attr references | Rejected before insertion. |

The tuple validator now distinguishes fixed positional types/length from a
homogeneous ellipsis tuple. JS arrays represent tuples; this does not create a
separate JavaScript tuple type. Regex IGNORECASE, selected Unicode classes and
Python-specific constructs are rejected; error classes/messages need not match.

<a id="gbj-020-010"></a>

## 010 · Deferred design and limitations

Recipes and whole-Source replacement helpers are not implemented.
The earlier provisional implementation was removed as outside the Python port contract. Component/container signature parity
and complete declaration inheritance parity have not been exhaustively established.

Argument splitting documents the supported forms; surplus arguments are currently
ignored rather than rejected. A plain record in the first slot is attributes,
not a general object-value representation. Changing this contract requires a
separate decision, not an inferred conversion layer.

This register records known boundaries. It is not evidence of complete Python
parity or authorization to add compatibility mechanisms. Corrected items include
runtime templates, synchronous direct resolvers, _wdg, includeDatapath and direct
Date values. The Gramlot project maintains the wider cross-repository GC-105 record.


## Source node ownership before insertion notification

Both implementations use their SourceBag/SourceBagNode subclasses for dialect
ownership. Python assigns the subbuilder after element creation. JavaScript assigns
the same ownership in SourceBagNode construction because live insertion subscribers
run synchronously. It uses Bag's existing nodeClass extension point; no additional
Bag node factory hook is required. This does not provide a tag-mutation extension
or depend on Bag mutation validators.


Grammar checks remain Builder responsibilities. No Bag mutation-validator API is
required. If upstream Bag rejects an insertion, prebuilt branch ownership is
restored; if an insertion subscriber throws after publication, the inserted node
keeps its assigned builder and the error propagates. In either case the temporary
insertion context is restored, including during reentrant authoring.
