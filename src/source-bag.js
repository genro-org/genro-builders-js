// Copyright 2025 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
/**
 * Builder-aware Bag and BagNode — JS port of source_bag.py.
 *
 * `SourceBag`/`SourceBagNode` extend the plain `Bag`/`BagNode` of
 * genro-bag-js with grammar dispatch and the data-binding surface
 * (pointer resolution, absolute datapath composition, the reactive
 * SET/GET/PUT/FIRE macros). The fluent API (`root.body().h1('x')`) is
 * served by a `Proxy`, the JS equivalent of Python's `__getattribute__`
 * (bag: schema first) and `__getattr__` (node: real props first).
 *
 * Ported linearly from source_bag.py, including symbolic datapaths
 * (`#FORM`/`#ANCHOR`/`#<id>`).
 */
import { Bag, BagNode } from '@jsr/genro__bag';
import { registerClass, fromTytx, toTytx } from '@jsr/genro__tytx';
import { pythonKeywordAttribute } from './utils.js';

/** Sentinel key for a node's own value in runtimeToEvaluate (Python's None). */
export const VALUE = Symbol('value');

/** Structural attributes that never reach the rendered markup. */
export const META_ATTRS = new Set([
    '_meta', 'datapath', 'node_id', 'ns', 'form', 'formId', '_anchor', 'updateOn',
]);

/** Domain attributes only, using the same keyword spelling in every consumer. */
export function sourceAttributeItems(attributes) {
    return Object.entries(attributes || {})
        .filter(([name]) => !META_ATTRS.has(name))
        .map(([name, value]) => [pythonKeywordAttribute(name), value]);
}

/** Node subclass: builder slot, per-document serial, data-binding surface. */
export class SourceBagNode extends BagNode {
    constructor(parentBag, label, value = null, attr = null,
                resolver = null, nodeTag = null, xmlTag = null) {
        super(parentBag, label, value, attr, resolver, nodeTag, xmlTag);
        // Complete ownership before Bag publishes insertion to synchronous subscribers.
        this._builder = parentBag?._insertingBuilder ?? parentBag?._builder ?? null;
        this._targetId = null;
    }

    /** Active builder: own slot, else the closest ancestor's. */
    get builder() {
        if (this._builder) {
            return this._builder;
        }
        const parent = this.parentBag;
        return parent ? parent._builder : null;
    }

    /** The document datastore, owned by the active builder. */
    get data() { return this.builder.data; }

    /** The page builder mounted on the document. */
    get rootBuilder() {
        return this.parentBag.root._builder;
    }

    /** Read schema `_meta` values carried by this node. */
    _getMeta(keys) {
        const meta = this.getAttr('_meta') || {};
        const names = keys.split(',').map((k) => k.trim());
        if (names.length === 1) {
            return meta[names[0]] !== undefined ? meta[names[0]] : null;
        }
        return names.map((n) => (meta[n] !== undefined ? meta[n] : null));
    }

    /** Return "^" (reactive), "=" (passive) or null. */
    pointerType(v) {
        if (typeof v === 'string' && (v[0] === '^' || v[0] === '=')) {
            return v[0];
        }
        return null;
    }

    /** Reactive pointers carried by this node as [attrname, pointer].
     *  attrname "" for a pointer in node.value. Only `^` (reactive). */
    pointers() {
        const result = [];
        for (const [attrname, v] of Object.entries(this.getAttr() || {})) {
            if (this.pointerType(v) === '^') {
                result.push([attrname, v]);
            }
        }
        if (this.pointerType(this.value) === '^') {
            result.push(['', this.value]);
        }
        return result;
    }

    /** Domain attributes as [name, value] pairs, names canonicalized. */
    fixedAttrItems() {
        return sourceAttributeItems(this.getAttr());
    }

    /** Attributes to resolve plus the node value under the VALUE sentinel. */
    runtimeToEvaluate() {
        const items = new Map(this.fixedAttrItems());
        items.set(VALUE, this.value);
        return items;
    }

    // --- path composition (DAT.2), ported from source_bag.py ---------

    /** Compose the absolute datastore path for `path` relative to this node. */
    absDatapath(path) {
        const raw = path;
        if (this.pointerType(path)) {
            path = path.slice(1);
        }
        let attr = null;
        if (path.includes('?')) {
            [path, attr] = path.split('?', 2);
        }
        if (path.startsWith('#')) {
            return this._resolveSymbolicDatapath(path, raw);
        }
        if (path.startsWith('.')) {
            path = this._composeRelativeDatapath(path, raw);
        }
        return this._finalizeAbsPath(path, attr);
    }

    _finalizeAbsPath(path, attr) {
        path = this._collapseParentDatapath(path, path);
        return attr ? `${path}?${attr}` : path;
    }

    _composeRelativeDatapath(path, raw) {
        let current = this;
        while (current !== null && path.startsWith('.')) {
            const dp = current.getAttr('datapath');
            if (dp !== null && dp !== undefined) {
                path = path === '.' ? dp : dp + path;
            }
            current = current.parentNode;
        }
        if (path.startsWith('.')) {
            throw new Error(`unresolved relative datapath: ${raw}`);
        }
        return path;
    }

    _collapseParentDatapath(path, raw) {
        const out = [];
        for (const segment of path.split('.')) {
            if (segment === '#parent') {
                if (out.length === 0) {
                    throw new Error(`#parent has no segment to cancel: ${raw}`);
                }
                out.pop();
            } else {
                out.push(segment);
            }
        }
        return out.join('.');
    }

    /** Resolve a `#SYMBOL[.relpath]` path.
     *  #FORM → nearest ancestor with formId set or form=true;
     *  #ANCHOR → nearest ancestor with `_anchor` present;
     *  #<id> → node carrying that node_id. The anchor then resolves
     *  `relpath` relatively (its own datapath chain is consulted). */
    _resolveSymbolicDatapath(path, raw) {
        const s = path.slice(1);
        const idx = s.indexOf('.');
        const symbol = idx === -1 ? s : s.slice(0, idx);
        const relpath = idx === -1 ? '' : s.slice(idx + 1);
        let anchor;
        if (symbol === 'FORM') {
            anchor = this._findMarkedDatapathAncestor(true, false, raw);
        } else if (symbol === 'ANCHOR') {
            anchor = this._findMarkedDatapathAncestor(false, true, raw);
        } else {
            const builder = this.rootBuilder;
            if (!builder) {
                throw new Error(`#<id>: cannot resolve ${raw} on a node without builder`);
            }
            anchor = builder.source.getNodeByAttr('node_id', symbol);
            if (anchor === null || anchor === undefined) {
                throw new Error(`#<id>: cannot resolve ${raw}`);
            }
        }
        return anchor.absDatapath(relpath ? `.${relpath}` : '.');
    }

    /** Walk ancestors (from this node) for the requested marker.
     *  form → formId set OR form===true; anchor → `_anchor` present. */
    _findMarkedDatapathAncestor(form, anchor, raw) {
        let current = this;
        while (current !== null && current !== undefined) {
            const attrs = current.getAttr() || {};
            if (form && (attrs.formId != null || attrs.form === true)) {
                return current;
            }
            if (anchor && '_anchor' in attrs) {
                return current;
            }
            current = current.parentNode;
        }
        const marker = form ? 'FORM' : 'ANCHOR';
        throw new Error(`#${marker}: no marked ancestor found for ${raw}`);
    }

    // --- datastore access + data-logic macros ------------------------

    /** Read the datastore at `path` resolved relative to this node. */
    getRelativeData(path, defaultValue = null, { autocreate = false } = {}) {
        const data = this.data;
        const absPath = this.absDatapath(path);
        if (autocreate && data.getItem(absPath) == null) data.setItem(absPath, defaultValue);
        return data.getItem(absPath, defaultValue);
    }

    /** Write `value` into the datastore at `path`. */
    setRelativeData(path, value, { attributes = null, fired = false, reason = null } = {}) {
        const data = this.data;
        const absPath = this.absDatapath(path);
        // bag-js setItem(path, value, attr, nodePosition, updattr,
        // removeNullAttributes, reason, fired). Omitted reason → true
        // (the write is its own origin), parity with set_relative_data.
        data.setItem(absPath, value, attributes, '>', false, true,
            reason === null ? true : reason, fired);
    }

    fireEvent(path, value = true, { attributes = null, reason = null } = {}) {
        this.setRelativeData(path, value, { attributes, fired: true, reason });
    }

    SET(path, value) { this.setRelativeData(path, value); }

    GET(path) { return this.getRelativeData(path); }

    PUT(path, value) { this.setRelativeData(path, value, { reason: false }); }

    FIRE(path, value = true) { this.setRelativeData(path, value, { fired: true }); }
}

/** Bag subclass: dispatches tag names to the active builder. */
export class SourceBag extends Bag {
    static tytxSuffix = 'SOURCE';

    constructor(source = null, builder = null) {
        super(source);
        this._builder = builder;
        this._insertingBuilder = null;
    }

    get nodeClass() {
        return SourceBagNode;
    }

    /** Insert with complete ownership visible to insertion subscribers. */
    _setBuilderItem(builder, bindings, label, ...args) {
        const previousBindings = bindings?.map(([item]) => [item, item._builder]) || null;
        if (bindings) {
            for (const [item, owner] of bindings) item._builder = owner;
        }
        const previousBuilder = this._insertingBuilder;
        this._insertingBuilder = builder;
        try {
            return this.setItem(label, ...args);
        } catch (error) {
            // Bag can reject insertion (for example an invalid label). Subscriber
            // errors occur after insertion and must preserve committed ownership.
            if (this.node(label) == null && previousBindings) {
                for (const [item, owner] of previousBindings) item._builder = owner;
            }
            throw error;
        } finally {
            this._insertingBuilder = previousBuilder;
        }
    }

    /** Attach runtime-only ownership after typed deserialization. Identity is
     *  preserved; only genuine SourceBag branches participate. */
    bindBuilder(builder) {
        if (!builder) {
            throw new Error('SourceBag.bindBuilder requires a builder');
        }
        const assignments = this._builderBindingPlan(builder);
        for (const [item, owner] of assignments) item._builder = owner;
        this.setBackref();
        return this;
    }

    /** Validate and plan ownership for the complete Source graph. */
    _builderBindingPlan(builder) {
        const assignments = [];
        const seen = new WeakSet();
        const collect = (branch, activeBuilder) => {
            if (seen.has(branch)) {
                throw new Error('source contains a cyclic or shared SourceBag branch');
            }
            seen.add(branch);
            assignments.push([branch, activeBuilder]);
            for (const node of branch.getNodes()) {
                let nodeBuilder = activeBuilder;
                const spec = node._getMeta('subbuilder');
                if (spec != null) {
                    nodeBuilder = activeBuilder._resolveSubbuilderReference(
                        spec, node.getAttr() || {}, node.nodeTag,
                    );
                }
                assignments.push([node, nodeBuilder]);
                const value = node.getValue(true);
                if (value instanceof SourceBag) collect(value, nodeBuilder);
            }
        };
        collect(this, builder);
        return assignments;
    }
}

registerClass(SourceBag);

/**
 * Split call arguments into `{value, attrs}`: `h1('Hello')` → value;
 * `div('t', {id})` → value + attrs; `svg({width})` → attrs only.
 * Only plain records are attribute dictionaries; typed objects remain values.
 */
function splitArgs(args) {
    if (args.length === 0) {
        return { value: null, attrs: {} };
    }
    const first = args[0];
    if (first !== null && typeof first === 'object') {
        const prototype = Object.getPrototypeOf(first);
        if (prototype === Object.prototype || prototype === null) {
            return { value: null, attrs: first };
        }
    }
    return { value: first, attrs: args[1] || {} };
}

const SKIP = new Set(['then', 'toJSON']);
const SOURCE_TARGETS = new WeakMap();

/** Return the underlying SourceBag/SourceBagNode for a fluent source handle. */
export function sourceTarget(value) {
    return SOURCE_TARGETS.get(value) || value;
}

/** Wrap a SourceBag/SourceBagNode in the grammar Proxy so tag names
 *  dispatch to the builder. Returns the input unchanged when detached. */
export function wrapSource(target) {
    if (target === null || target === undefined) {
        return target;
    }
    target = sourceTarget(target);
    const builder = target._builder || (target.parentBag && target.parentBag._builder);
    if (!builder) {
        return target;
    }
    return builder.wrapSource(target);
}

/** Internal constructor used by BuilderBase to cache stable fluent handles. */
export function createSourceHandle(builder, target) {
    const onBag = target instanceof Bag;
    const proxy = new Proxy(target, {
        get(obj, prop) {
            if (typeof prop === 'symbol' || prop.startsWith('_') || SKIP.has(prop)) {
                return Reflect.get(obj, prop, obj);
            }
            const tag = builder.schemaTag(prop);
            if (onBag && tag) {
                return elementCall(builder, obj, tag, onBag);
            }
            if (prop in obj) {
                const v = Reflect.get(obj, prop, obj);
                return typeof v === 'function' ? v.bind(obj) : v;
            }
            if (tag) {
                return elementCall(builder, obj, tag, onBag);
            }
            // @container: a body-carrying method that GENERATES source at
            // call time (legacy gnrwebstruct parity). It runs with the
            // target (wrapped, so its body can dispatch tags) as first arg.
            const method = builder.containerMethod(prop);
            if (method) {
                return (...args) => builder[method](builder.wrapSource(obj), ...args);
            }
            return undefined;
        },
    });
    SOURCE_TARGETS.set(proxy, target);
    return proxy;
}

/** Build the callable that creates and returns a wrapped child node. */
function elementCall(builder, target, tag, onBag) {
    return (...args) => {
        const { value, attrs } = splitArgs(args);
        const node = onBag
            ? builder.bagCall(target, tag, value, attrs)
            : builder.commandOnNode(target, tag, value, attrs);
        return node.builder.wrapSource(node);
    };
}

/** Encode a SourceBag through the generic TYTX registry, preserving its root type. */
export function sourceBagToTytx(source, { transport = 'json' } = {}) {
    if (!(source instanceof SourceBag)) {
        throw new TypeError('sourceBagToTytx requires a SourceBag');
    }
    return toTytx(source, transport === 'json' ? null : transport);
}

/** Decode a registered SourceBag and bind runtime-only builder ownership in place. */
export function sourceBagFromTytx(payload, builder, { transport = 'json' } = {}) {
    const source = fromTytx(payload, transport === 'json' ? null : transport);
    if (!(source instanceof SourceBag)) {
        throw new TypeError('TYTX payload did not decode to SourceBag');
    }
    return source.bindBuilder(builder);
}
