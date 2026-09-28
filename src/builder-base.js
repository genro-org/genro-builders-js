// Copyright 2025 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
/**
 * BuilderBase — JS port of builder/base.py + _grammar.py.
 *
 * A builder owns a grammar (loaded from `builder_grammar` JSON)
 * and a `source` SourceBag. The fluent API lands through the source
 * Proxy: `root.body()` → `bagCall`, `node.h1('x')` → `commandOnNode`,
 * both converging on `setChild`.
 *
 * The source lives under the structural `SOURCE_ROOT` segment of a
 * wrapper root (`_sourceroot`): `source` is the payload `main` builds and
 * `_sourceroot` provides the tree-not-forest guarantee.
 *
 * The builder owns one flat Data Bag. `runtimeValues(node)` resolves `^`/`=`
 * pointers once for static creation/rendering; reactive subscriptions and
 * partial browser patches belong to Gramlot.
 */
import { Bag, BagResolver } from '@jsr/genro__bag';
import { SourceBag, SourceBagNode, createSourceHandle, sourceTarget, VALUE } from './source-bag.js';
import { parseGrammarDocument, resolveGrammarDeclarations, validateElementValues } from './grammar-loader.js';
import { Collection } from './collection.js';
import { XmlRenderer } from './renderer/xml.js';
import BASE_GRAMMAR from './collections/base.json' with { type: 'json' };

/** Visit declaration owners from the base class to the most specific class. */
function classChain(cls) {
    const chain = [];
    while (cls && cls !== Function.prototype) {
        chain.push(cls);
        cls = Object.getPrototypeOf(cls);
    }
    return chain.reverse();
}

/** Compose the inherited container namespace with Python's collision rule. */
function containerMap(BuilderClass) {
    const result = Object.create(null);
    const register = (name, method) => {
        const key = name.toLowerCase();
        const existing = result[key];
        if (existing !== undefined && existing !== method) {
            throw new Error(
                `container '${name}' is already tied to implementation method '${existing}' `
                + `(cannot rebind to '${method}')`,
            );
        }
        result[key] = method;
    };
    for (const owner of classChain(BuilderClass)) {
        if (Object.hasOwn(owner, 'containers')) {
            for (const name of owner.containers || []) register(name, name);
        }
    }
    return result;
}

/** Compile the case-insensitive authoring names for one unambiguous schema. */
function grammarTagNames(schema) {
    const names = Object.create(null);
    for (const name of Object.keys(schema)) {
        const key = name.toLowerCase();
        if (Object.hasOwn(names, key)) {
            throw new Error(`element declaration '${name}' has a case-insensitive collision with '${names[key]}'`);
        }
        names[key] = name;
    }
    return names;
}

/** Structural segment that carries the payload source (tree-not-forest). */
export const SOURCE_ROOT = '_root_';

/** Data-elements: transparent @elements (marked `_meta.data_element`) that
 *  run once during static creation — a setter seeds a datum, a formula computes
 *  one from others, a controller runs side effects. Grammar of BuilderBase,
 *  so every dialect inherits them. Called with a kwargs object
 *  (`dataSetter({destination, value})`, `dataFormula({destination, func, ...bindings})`,
 *  `dataController({func, ...bindings})`) — DIFF-PYTHON: JS has no **kwargs. */
/** Schema fields of a data-element, stripped from the func bindings. */
export const DATA_ELEMENT_FIELDS = new Set(['destination', 'func', 'value', '_on_start']);

export class BuilderBase {
    /** The SourceBag class of this builder's Source (legacy GenroPy
     *  `domSrcFactory`): the builder declares the class of the Source, the
     *  Source declares the class of its nodes (`nodeClass`). It is
     *  instantiated for `_sourceroot`, for the `source` payload under
     *  SOURCE_ROOT and for the component expansion root, always as
     *  `new _sourceClass(null, builder)`. Branches created while authoring,
     *  including a promoted scalar node, follow the class of their parent
     *  bag. Redefine it on a subclass to use a SourceBag subclass; to travel
     *  on the TYTX wire, the subclass must be registered in the TYTX subtype
     *  dictionary of `X`. Same name as Python `_source_class`. */
    static _sourceClass = SourceBag;

    static registerBuilder(BuilderClass) {
        if (typeof BuilderClass !== 'function' || !(BuilderClass.prototype instanceof BuilderBase)) {
            throw new TypeError('registerBuilder requires a BuilderBase subclass');
        }
        const name = BuilderClass._name;
        if (typeof name !== 'string' || !name) {
            throw new TypeError('registered builders require a non-empty static _name');
        }
        const existing = BuilderBase._registry.get(name);
        if (existing && existing !== BuilderClass) {
            throw new Error(
                `Builder name '${name}' is already registered to ${existing.name}; `
                + `cannot register ${BuilderClass.name}`,
            );
        }
        BuilderBase._registry.set(name, BuilderClass);
        return BuilderClass;
    }

    static getBuilderClass(name) {
        const BuilderClass = BuilderBase._registry.get(name);
        if (!BuilderClass) throw new Error(`No builder registered with name '${name}'`);
        return BuilderClass;
    }

    constructor(name = null) {
        this.name = name || this.constructor._name;
        this.data = new Bag();
        this.data.setBackref();
        this._defaultTargets = new Map();
        this.materialized = Object.create(null);
        this._collection = null;
        this._schemaOverride = null;
        this._tagNamesOverride = null;
        this._componentMap = null;
        this._targetSerial = 0;
        this._subbuilders = new Map();
        this._sourceHandles = new WeakMap();
        const SourceClass = this.constructor._sourceClass;
        this._sourceroot = new SourceClass(null, this);
        // Backref first, so the SOURCE_ROOT sub-bag inherits it on insert
        // (bag-js propagates backref to children at insert time).
        this._sourceroot.setBackref();
        this._sourceroot.setItem(SOURCE_ROOT, new SourceClass(null, this));
        this.source = this._sourceroot.getItem(SOURCE_ROOT);
    }

    /** Stable fluent handle for a raw source bag or node. */
    wrapSource(target) {
        target = sourceTarget(target);
        if (!(target instanceof SourceBag) && !(target instanceof SourceBagNode)) {
            throw new TypeError('wrapSource requires a SourceBag or SourceBagNode');
        }
        let handle = this._sourceHandles.get(target);
        if (!handle) {
            handle = createSourceHandle(this, target);
            this._sourceHandles.set(target, handle);
        }
        return handle;
    }

    get root() { return this.wrapSource(this.source); }

    /** Return the host-local instance for a registered dialect name. */
    getSubbuilder(name) {
        if (typeof name !== 'string' || !name || name.includes(':')) {
            throw new Error(`unsupported subbuilder reference '${name}'`);
        }
        let subbuilder = this._subbuilders.get(name);
        if (!subbuilder) {
            const BuilderClass = BuilderBase.getBuilderClass(name);
            subbuilder = new BuilderClass();
            this._subbuilders.set(name, subbuilder);
        }
        subbuilder.data = this.data;
        return subbuilder;
    }

    _resolveSubbuilderReference(spec, _attrs, tag) {
        if (typeof spec !== 'string' || !spec) {
            throw new Error(`'${tag}': subbuilder declaration must be a non-empty string`);
        }
        if (spec.includes(':')) {
            throw new Error(
                `'${tag}': runtime subbuilder reference '${spec}' is unsupported`,
            );
        }
        return this.getSubbuilder(spec);
    }

    // --- grammar -----------------------------------------------------

    /** Build `_classSchema` from a `builder_grammar` doc, merging the
     *  parent's (the mixin/inheritance chain). Called in a subclass
     *  `static {}` block — the JS equivalent of Python `__init_subclass__`.
     *  Static components and containers are registered separately because
     *  they carry executable bodies. */
    static defineGrammar(doc) {
        const current = this._classCollection;
        const collection = current
            ? new Collection(current.toDocument()).update(doc) : new Collection(doc);
        const parsed = parseGrammarDocument(collection.toDocument());
        const resolved = resolveGrammarDeclarations(parsed);
        const tagNames = grammarTagNames(resolved.elements);
        this._classCollection = collection;
        this._classSchema = resolved.elements;
        this._abstracts = resolved.abstracts;
        this._tagNames = tagNames;
    }

    // The data-elements are grammar of the base, inherited by every dialect.
    static { this.defineGrammar(BASE_GRAMMAR); }

    /** Map lowercase → method name for containers declared along the class chain. */
    get _containers() {
        return containerMap(this.constructor);
    }

    /** The method name for the container `name`, or null. */
    containerMethod(name) {
        return this._containers[name.toLowerCase()] || null;
    }

    componentMethod(name) {
        return this._componentMap?.[name.toLowerCase()] || null;
    }

    get schema() {
        return this._schemaOverride || this.constructor._classSchema || {};
    }

    get schemaTagNames() {
        if (this._schemaOverride) {
            return this._tagNamesOverride ??= grammarTagNames(this.schema);
        }
        return this.constructor._tagNames ??= grammarTagNames(this.schema);
    }

    schemaTag(name) {
        const lookup = name.toLowerCase();
        const direct = this.schemaTagNames[lookup];
        if (direct) {
            return direct;
        }
        const prefix = `${this.constructor._name}_`;
        if (lookup.startsWith(prefix)) {
            return this.schemaTagNames[lookup.slice(prefix.length)] || null;
        }
        return null;
    }

    /** Compose JSON declarations, validate completely, then publish the new schema. */
    loadGrammar(doc, { replace = false } = {}) {
        const current = this._collection || this.constructor._classCollection;
        const collection = replace ? new Collection(doc)
            : new Collection(current.toDocument()).update(doc);
        const parsed = parseGrammarDocument(collection.toDocument());
        const resolved = resolveGrammarDeclarations(parsed);
        const tagNames = grammarTagNames(resolved.elements);
        this._collection = collection;
        this._schemaOverride = resolved.elements;
        this._tagNamesOverride = tagNames;
        return this;
    }

    /** Public value check used by renderers after removing framework attrs. */
    validateNodeValues(tag, value, attrs = {}) {
        const actual = this.schemaTag(tag);
        if (!actual) throw new Error(`unknown element '${tag}'`);
        validateElementValues(actual, this.schema[actual], value, attrs);
        return true;
    }

    /** Validate an arbitrary source node (including renderer candidates). */
    validateNode(node, { value, attrs, childTags } = {}) {
        if (!node || typeof node.nodeTag !== 'string') throw new TypeError('validateNode requires a source node');
        const nodeValue = value !== undefined ? value
            : (node.value instanceof SourceBag ? null : node.value);
        this.validateNodeValues(node.nodeTag, nodeValue, attrs || node.getAttr?.() || {});
        const info = this.schema[this.schemaTag(node.nodeTag)];
        const tags = childTags || (node.value instanceof SourceBag
            ? node.value.getNodes().map(n => n.nodeTag) : null);
        if (tags) {
            this._validateChildren(node.nodeTag, info, tags, false);
        }
        return true;
    }

    /** Validate an arbitrary list of semantic child tags for a parent tag. */
    validateChildren(tag, childTags, { includeMinimum = false } = {}) {
        const actual = this.schemaTag(tag);
        if (!actual) throw new Error(`unknown element '${tag}'`);
        if (!Array.isArray(childTags) || childTags.some(name => typeof name !== 'string')) {
            throw new TypeError('childTags must be an array of strings');
        }
        return this._validateChildren(actual, this.schema[actual], childTags, includeMinimum);
    }

    /** Validate one element against its semantic parent. A null parent means
     *  the element is at the Source root; SOURCE_ROOT itself is transparent. */
    validateParent(tag, parentTag = null) {
        const actual = this.schemaTag(tag);
        if (!actual) throw new Error(`unknown element '${tag}'`);
        const info = this.schema[actual];
        if (!this._countsForGrammar(info)) return true;
        const spec = info._parentSpec;
        if (spec == null || spec.has('*')) return true;
        if (parentTag === null) throw new Error(`'${actual}' requires a declared parent`);
        const actualParent = this.schemaTag(parentTag);
        if (!actualParent) throw new Error(`unknown parent element '${parentTag}'`);
        this._validateParent(actual, info, actualParent);
        return true;
    }

    // --- node creation (the fluent API converges here) ---------------

    bagCall(bag, tag, value, attrs) {
        return this.setChild(bag, tag, value, attrs);
    }

    commandOnNode(node, tag, value, attrs) {
        node = sourceTarget(node);
        if (node.value instanceof SourceBag) {
            return this.setChild(node.value, tag, value, attrs);
        }
        const oldValue = node.value;
        // The branch is an instance of the parent bag's class, as in Python
        // (`type(node.parent_bag)`): a SourceBag subclass propagates down.
        const branch = new node.parentBag.constructor(null, node.builder || this);
        // Validate and insert into a detached branch first. A rejected child
        // therefore cannot change the authored parent.
        const child = this.setChild(branch, tag, value, attrs, node);
        this.promoteNodeValue(node, oldValue, branch);
        return child;
    }

    /** Hook for dialects that preserve a scalar while promoting a node to a branch. */
    promoteNodeValue(node, _oldValue, branch) { node.setValue(branch); }

    setChild(bag, tag, value, attrs, parentOverride = null) {
        const attributes = { ...attrs };
        const info = this.schema[tag];
        if (!info) throw new Error(`unknown element '${tag}'`);
        this.validateNodeValues(tag, value, attributes);
        const subbuilderSpec = info._meta?.subbuilder;
        const subbuilder = subbuilderSpec == null
            ? null : this._resolveSubbuilderReference(subbuilderSpec, attributes, tag);
        const branchBuilder = subbuilder || this;
        const branchBindings = value instanceof SourceBag
            ? value._builderBindingPlan(branchBuilder) : null;
        const rootBuilder = parentOverride?.rootBuilder || bag.root._builder || this;
        if (attributes.node_id != null && rootBuilder.source.getNodeByAttr('node_id', attributes.node_id)) {
            throw new Error(`Duplicate node_id '${attributes.node_id}'`);
        }
        if (value instanceof SourceBag) {
            this._validateChildren(tag, info, value.getNodes().map(node => node.nodeTag), false);
        }
        const parent = parentOverride || bag.parentNode;
        const parentInfo = parent?.nodeTag ? this.schema[parent.nodeTag] : null;
        if (parentInfo && !parent._getMeta('subbuilder') && this._countsForGrammar(info)) {
            this._validateParent(tag, info, parent.nodeTag);
            this._validateChildren(parent.nodeTag, parentInfo, [...bag.getNodes().map(n => n.nodeTag), tag], false);
        } else if (!parentInfo && !parent?._getMeta('subbuilder')
            && info._parentSpec != null && this._countsForGrammar(info)) {
            throw new Error(`'${tag}' requires a declared parent`);
        }
        if (info._meta && !('_meta' in attributes)) {
            attributes._meta = info._meta;
        }
        if (info.ns && !('ns' in attributes)) {
            attributes.ns = info.ns;
        }
        const nodePosition = attributes.node_position;
        delete attributes.node_position;
        const explicitLabel = attributes.node_label;
        delete attributes.node_label;
        let label;
        if (parentInfo?.collection_key) {
            if (explicitLabel != null) throw new Error(`'${tag}': node_label is not allowed in a collection`);
            label = this._collectionLabel(parentInfo.collection_key, tag, attributes);
        } else {
            const bound = parentInfo?._subSpec?.get(tag);
            if (bound && bound.max === 1) {
                if (explicitLabel != null) throw new Error(`'${tag}': node_label is not allowed on a singleton`);
                label = tag;
            } else label = explicitLabel || info.node_label || this._autoLabel(bag, tag);
        }
        if (bag.node(label) != null) throw new Error(`duplicate node label '${label}'`);
        const node = bag._setBuilderItem(branchBuilder, branchBindings, label,
            value, attributes, nodePosition || '>',
            false, true, null, false, true, null, tag);
        return node;
    }

    _countsForGrammar(info) {
        const meta = info?._meta || {};
        return !(meta.data_element || meta.subbuilder || meta.component);
    }

    _validateParent(tag, info, parentTag) {
        const spec = info._parentSpec;
        if (spec == null || spec.has('*') || !this._countsForGrammar(info)) return;
        if (!spec.has(parentTag)) throw new Error(`'${tag}' not allowed as child of '${parentTag}'`);
    }

    _validateChildren(parentTag, info, tags, includeMinimum) {
        const spec = info._subSpec;
        if (spec == null || spec.has('*') || info._meta?.subbuilder) return [];
        const counts = new Map();
        for (const tag of tags) {
            const child = this.schema[tag];
            if (child && !this._countsForGrammar(child)) continue;
            const bounds = spec.get(tag);
            if (!bounds) throw new Error(`'${tag}' not allowed as child of '${parentTag}'`);
            const count = (counts.get(tag) || 0) + 1; counts.set(tag, count);
            if (count > bounds.max) throw new Error(`too many '${tag}' in '${parentTag}'`);
        }
        return includeMinimum
            ? [...spec].filter(([tag, bounds]) => (counts.get(tag) || 0) < bounds.min).map(([tag]) => tag)
            : [];
    }

    _collectionLabel(key, tag, attrs) {
        const value = name => {
            if (attrs[name] === null || attrs[name] === undefined) throw new Error(`'${tag}': collection key needs attribute '${name}'`);
            return String(attrs[name]);
        };
        return key.includes('${') ? key.replace(/\$\{([^}]+)\}/g, (_m, name) => value(name)) : value(key);
    }

    /** Return [path, missingTags] entries for unmet minimum cardinalities. */
    validateSource() {
        const problems = [];
        const walk = (bag, prefix = '') => {
            for (const node of bag.getNodes()) {
                const path = prefix ? `${prefix}.${node.label}` : node.label;
                const builder = node.builder;
                const info = builder.schema[node.nodeTag];
                if (info && !node._getMeta('data_element,subbuilder,component').some(Boolean)) {
                    const children = node.value instanceof SourceBag ? node.value.getNodes().map(n => n.nodeTag) : [];
                    const missing = builder._validateChildren(node.nodeTag, info, children, true);
                    if (missing.length) problems.push([path, missing]);
                }
                if (node.value instanceof SourceBag) walk(node.value, path);
            }
        };
        walk(this.source);
        return problems;
    }

    _autoLabel(bag, tag) {
        let n = 0;
        while (bag.node(`${tag}_${n}`) !== null && bag.node(`${tag}_${n}`) !== undefined) {
            n += 1;
        }
        return `${tag}_${n}`;
    }

    /** Source node carrying `nodeId` (per-builder id namespace), wrapped
     *  so the grammar dispatch (`.li(...)`) works, like Python's __getattr__. */
    nodeById(nodeId) {
        const node = this.source.getNodeByAttr('node_id', nodeId);
        if (node === null || node === undefined) {
            throw new Error(`node_id not found: ${nodeId}`);
        }
        return node.builder.wrapSource(node);
    }

    // --- data binding ------------------------------------------------

    /** Resolve the pointers/values a node carries → [runtimeValue, runtimeAttrs]. */
    runtimeValues(node) {
        const resolved = new Map();
        const carried = {};
        const isDataElement = node._getMeta('data_element');
        for (const [k, v] of node.runtimeToEvaluate()) {
            if (v instanceof BagResolver) {
                resolved.set(k, v.resolve());
                continue;
            }
            if (!node.pointerType(v)) {
                resolved.set(k, v);
                continue;
            }
            const absPath = node.absDatapath(v);
            resolved.set(k, this.data.getItem(absPath));
            if (!isDataElement && !absPath.includes('?') && k === VALUE) {
                const dataNode = this.data.getNode(absPath);
                if (dataNode) Object.assign(carried, dataNode.getAttr('_wdg'));
            }
        }
        const consumed = new Set();
        for (const [k, v] of resolved) {
            if (isDataElement || k === VALUE || typeof v !== 'string') continue;
            resolved.set(k, v.replace(/(\\)?\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (token, escaped, name) => {
                if (escaped) return token.slice(1);
                if (!resolved.has(name)) throw new Error(`Unknown template parameter '${name}'`);
                consumed.add(name);
                const value = resolved.get(name);
                return value === null ? '' : String(value);
            }));
        }
        const runtimeValue = resolved.get(VALUE);
        resolved.delete(VALUE);
        for (const name of consumed) resolved.delete(name);
        return [runtimeValue, { ...Object.fromEntries(resolved), ...carried }];
    }

    /** Stable per-document identity assigned when a renderer requests it. */
    targetId(node) {
        if (node._targetId) {
            return node._targetId;
        }
        const root = node.rootBuilder;
        if (node.parentBag.root !== root.source.root) {
            return null;
        }
        root._targetSerial += 1;
        node._targetId = `n${root._targetSerial}`;
        return node._targetId;
    }

    // --- data-element logic ------------------------------------------

    /** Sources searched (left-to-right) to resolve a data-element func.
     *  Default `[this]`; override `_buildDataLogic` to add more. */
    get dataLogic() {
        if (!this._dataLogic) {
            const built = this._buildDataLogic();
            this._dataLogic = Array.isArray(built) ? built : [built];
        }
        return this._dataLogic;
    }

    _buildDataLogic() { return this; }

    /** Resolve a callable or a named static function over dataLogic sources. */
    _resolveLogicFunc(func) {
        if (typeof func === 'function') {
            return func;
        }
        if (typeof func !== 'string') {
            throw new Error('data-element func must be a name or a function');
        }
        for (const source of this.dataLogic) {
            const holder = typeof source === 'function' ? source : source.constructor;
            const fn = holder[func];
            if (typeof fn === 'function') {
                return fn;
            }
        }
        throw new Error(`data-element func '${func}' not found on any data_logic source`);
    }

    /** Resolve static bindings and remove the element's own fields. */
    _bindings(node) {
        const [, resolved] = this.runtimeValues(node);
        const out = {};
        for (const [k, v] of Object.entries(resolved)) {
            if (!DATA_ELEMENT_FIELDS.has(k)) {
                out[k] = v;
            }
        }
        return out;
    }

    /** Execute a list of data-element nodes. */
    computeLogic(nodes) {
        for (const node of nodes) {
            this._computeNode(node);
        }
    }

    /** Execute one data-element by kind: setter seeds, formula computes
     *  (pure), controller runs side effects (func gets the node). */
    _computeNode(node) {
        const attr = node.getAttr() || {};
        if (node.nodeTag === 'dataSetter') {
            const attrs = {};
            for (const [k, v] of Object.entries(attr)) {
                if (k !== 'destination' && k !== 'value' && !k.startsWith('_')) {
                    attrs[k] = v;
                }
            }
            node.setRelativeData(attr.destination, attr.value, {
                attributes: Object.keys(attrs).length ? attrs : null,
            });
        } else if (node.nodeTag === 'dataFormula') {
            const func = this._resolveLogicFunc(attr.func);
            node.setRelativeData(attr.destination, func(this._bindings(node)));
        } else if (node.nodeTag === 'dataController') {
            const func = this._resolveLogicFunc(attr.func);
            func(node, this._bindings(node));
        }
    }

    /** Every source data-element, in document order. */
    _dataElementNodes() {
        const result = [];
        const walk = (bag) => {
            for (const node of bag.getNodes()) {
                if (node._getMeta('data_element')) {
                    result.push(node);
                }
                if (node.value instanceof SourceBag) {
                    walk(node.value);
                }
            }
        };
        walk(this.source);
        return result;
    }

    // --- lifecycle ---------------------------------------------------

    setup(_data) {}

    main(_root) {
        throw new Error(
            `${this.constructor.name}.main() not implemented: a bare builder `
            + 'is grammar, not a renderable page',
        );
    }

    /** Add the @components declared via `static components = [...]` to the
     *  schema, marked `_meta.component`; the body stays a method on the
     *  page (run at render time by the renderer's expansion). */
    _resolveComponents() {
        const mappings = {};
        for (const owner of classChain(this.constructor)) {
            if (Object.hasOwn(owner, 'components')) {
                for (const name of owner.components || []) mappings[name] = name;
            }
        }
        if (!Object.keys(mappings).length) {
            return;
        }
        const merged = { ...this.schema };
        const componentMap = {};
        for (const [name, method] of Object.entries(mappings)) {
            merged[name] = { sub_tags: '', _meta: { component: true } };
            componentMap[name.toLowerCase()] = method;
        }
        const tagNames = grammarTagNames(merged);
        const current = this._collection || this.constructor._classCollection;
        const document = current.toDocument();
        document.abstracts = {};
        document.elements = Object.fromEntries(Object.keys(mappings).map(name => [name, merged[name]]));
        this._collection = new Collection(current.toDocument()).update(document);
        this._schemaOverride = merged;
        this._componentMap = componentMap;
        this._tagNamesOverride = tagNames;
    }

    /** Fresh throw-away root for a component expansion (CMP.2): a payload
     *  under SOURCE_ROOT inside a wrapper; `datapath` (the expansion's data
     *  anchor) is stamped on the structural node so the body's relative
     *  pointers find it through the ancestor climb. Built, rendered, dropped. */
    _expansionRoot(datapath = null) {
        const SourceClass = this.constructor._sourceClass;
        const wrapper = new SourceClass(null, this);
        wrapper.setBackref();   // before insert, so SOURCE_ROOT inherits it
        wrapper.setItem(SOURCE_ROOT, new SourceClass(null, this),
            datapath ? { datapath } : null);
        return wrapper.getItem(SOURCE_ROOT);
    }

    /** Static lifecycle: setup → component declarations → main → logic. */
    create() {
        this.setup(this.data);
        this._resolveComponents();
        this.main(this.root);
        this.computeLogic(this._dataElementNodes());
    }

    /** Every dialect can render an XML view of its Source. */
    get renderer_xml() { return new XmlRenderer(this); }

    /** Resolve the renderer declared by the dialect for a selected mode. */
    getRenderer(mode = null) {
        mode ??= this.constructor._defaultRenderMode;
        const renderer = this[`renderer_${mode}`];
        if (!renderer) {
            throw new Error(`${this.constructor.name} does not expose renderer_${mode}`);
        }
        return renderer;
    }

    /** Walk the Source, retaining fragments without delivering them. */
    materialize(mode = null, opts = {}) {
        mode ??= this.constructor._defaultRenderMode;
        const renderer = this.getRenderer(mode);
        const result = renderer.renderChildren(renderer.preprocess(this.source), opts);
        this.materialized[mode] = result;
        return result;
    }

    /** Register a destination for one render mode. */
    setRenderTarget(target, mode = null) {
        mode ??= this.constructor._defaultRenderMode;
        this._defaultTargets.set(mode, target);
    }

    /** Materialize the selected representation, then deliver it. */
    render({ mode = null, target = null, ...opts } = {}) {
        mode ??= this.constructor._defaultRenderMode;
        const renderer = this.getRenderer(mode);
        if (target === false && renderer.renderType !== 'string') {
            throw new TypeError('target=false is not valid for an object renderer');
        }
        const destination = target === false ? null : (target || this._defaultTargets.get(renderer.mode) || null);
        const options = { ...destination?.renderOpts, ...opts };
        return renderer.finalize(this.materialize(mode, options), destination, options);
    }

}

BuilderBase._registry = new Map();
