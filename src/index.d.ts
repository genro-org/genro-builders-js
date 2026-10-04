// Copyright 2026 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
/**
 * Type declarations for `@genro/builders`: grammar-driven builders that turn
 * JSON grammars into typed Source trees, with pluggable renderers.
 *
 * @module
 */
import type { Bag, BagNode, BagResolver } from '@genrojs/bag';

/** A tytx wire transport accepted by the Source serializers. */
export type SourceTransport = 'json' | 'xml' | 'msgpack';

/** A JSON value, as accepted in grammar documents. */
export type JsonValue =
    | null | string | number | boolean | JsonValue[] | { [key: string]: JsonValue };

/** A grammar document in the `builder_grammar` 1.1 format. */
export interface GrammarDocument {
    /** Format marker: `{ name: 'builder_grammar', version: '1.1' }`. */
    document_format: { name: string; version: string };
    /** Grammar-level metadata, merged key by key when documents are composed. */
    grammar: { [key: string]: JsonValue };
    /** Reusable declarations that elements inherit from. */
    abstracts: { [name: string]: { [key: string]: JsonValue } };
    /** Element declarations, keyed by tag name. */
    elements: { [name: string]: { [key: string]: JsonValue } };
}

/** Attributes of a source node: a plain record of values. */
export type SourceAttributes = { [name: string]: unknown };

/**
 * Fluent handle over a {@link SourceBag} or {@link SourceBagNode}.
 *
 * Besides the members of the wrapped object, every tag declared by the
 * grammar is available as a method that creates a child node and returns
 * the handle of the new node (`root.body().h1('x')`).
 */
export interface SourceHandle {
    /** Grammar tag methods and the members of the wrapped bag or node. */
    [name: string]: any;
}

/** Sentinel key for a node's own value in `runtimeToEvaluate()`. */
export const VALUE: unique symbol;

/** Structural attribute names that never reach the rendered markup. */
export const META_ATTRS: Set<string>;

/** Structural segment that carries the payload source under the wrapper root. */
export const SOURCE_ROOT: string;

/** Structural segment that carries the content Data Bag under the wrapper root. */
export const DATA_ROOT: string;

/** Schema fields of a data-element, stripped from the function bindings. */
export const DATA_ELEMENT_FIELDS: Set<string>;

/**
 * Return the domain attributes of a node as `[name, value]` pairs.
 *
 * Structural attributes listed in {@link META_ATTRS} are dropped and names
 * are canonicalized with the same keyword spelling in every consumer.
 *
 * @param attributes The raw attributes of a node.
 */
export function sourceAttributeItems(
    attributes: SourceAttributes | null | undefined,
): Array<[string, unknown]>;

/**
 * Return the underlying {@link SourceBag} or {@link SourceBagNode} of a
 * fluent source handle. A value that is not a handle is returned unchanged.
 *
 * @param value A fluent handle or a raw bag or node.
 */
export function sourceTarget<T = SourceBag | SourceBagNode>(value: unknown): T;

/**
 * Wrap a {@link SourceBag} or {@link SourceBagNode} in the grammar proxy so
 * that tag names dispatch to the builder. A detached target (without builder)
 * is returned unchanged, and `null`/`undefined` pass through.
 *
 * @param target The bag or node to wrap.
 */
export function wrapSource(target: SourceBag | SourceBagNode | null | undefined): SourceHandle | null | undefined;

/**
 * Encode a {@link SourceBag} through the tytx registry, preserving its root type.
 *
 * @param source The Source to encode.
 * @param options.transport The wire transport; defaults to `'json'`.
 * @throws {TypeError} When `source` is not a {@link SourceBag}.
 */
export function sourceBagToTytx(
    source: SourceBag,
    options?: { transport?: SourceTransport },
): string | Uint8Array;

/**
 * Decode a registered {@link SourceBag} and bind the runtime-only builder
 * ownership in place.
 *
 * @param payload The encoded Source.
 * @param builder The builder that will own the decoded Source.
 * @param options.transport The wire transport; defaults to `'json'`.
 * @throws {TypeError} When the payload does not decode to a {@link SourceBag}.
 */
export function sourceBagFromTytx(
    payload: string | Uint8Array,
    builder: BuilderBase,
    options?: { transport?: SourceTransport },
): SourceBag;

/** Options of {@link SourceBagNode.setRelativeData}. */
export interface SetRelativeDataOptions {
    /** Attributes stored on the datastore node. */
    attributes?: SourceAttributes | null;
    /** Publish the change as a fired event, without keeping the value. */
    fired?: boolean;
    /** Origin of the write; omitted means the write is its own origin. */
    reason?: unknown;
}

/**
 * Node of a {@link SourceBag}: carries the active builder, a per-document
 * serial and the data-binding surface (pointer resolution, absolute
 * datapaths and the reactive `SET`/`GET`/`PUT`/`FIRE` macros).
 */
export class SourceBagNode extends BagNode {
    /** The active builder: the node's own slot, else the closest ancestor's. */
    readonly builder: BuilderBase | null;
    /** The document datastore, owned by the active builder. */
    readonly data: Bag;
    /** The page builder mounted on the document. */
    readonly rootBuilder: BuilderBase;

    /**
     * Return `"^"` for a reactive pointer, `"="` for a passive one, else `null`.
     *
     * @param value The value to inspect.
     */
    pointerType(value: unknown): '^' | '=' | null;
    /**
     * Reactive pointers carried by this node as `[attributeName, pointer]`.
     * The attribute name is `""` for a pointer held in the node value.
     */
    pointers(): Array<[string, string]>;
    /** Domain attributes as `[name, value]` pairs, names canonicalized. */
    fixedAttrItems(): Array<[string, unknown]>;
    /** Attributes to resolve, plus the node value under the {@link VALUE} sentinel. */
    runtimeToEvaluate(): Map<string | symbol, unknown>;
    /**
     * Compose the absolute datastore path for `path`, relative to this node.
     * Handles `^`/`=` prefixes, `?attr` suffixes, relative paths, `#parent`
     * and the symbolic anchors `#FORM`, `#ANCHOR` and `#<node_id>`.
     *
     * @param path The path to resolve.
     * @throws {Error} When the path cannot be resolved.
     */
    absDatapath(path: string): string;
    /**
     * Read the datastore at `path`, resolved relative to this node.
     *
     * @param path The path to read.
     * @param defaultValue Value returned when the datum is missing.
     * @param options.autocreate Store `defaultValue` when the datum is missing.
     */
    getRelativeData(path: string, defaultValue?: unknown, options?: { autocreate?: boolean }): unknown;
    /**
     * Write `value` into the datastore at `path`, resolved relative to this node.
     *
     * @param path The destination path.
     * @param value The value to store.
     * @param options Attributes, fired flag and write origin.
     */
    setRelativeData(path: string, value: unknown, options?: SetRelativeDataOptions): void;
    /**
     * Fire an event on `path`: a write published to subscribers as fired.
     *
     * @param path The event path.
     * @param value The event payload; defaults to `true`.
     * @param options Attributes and write origin.
     */
    fireEvent(path: string, value?: unknown, options?: { attributes?: SourceAttributes | null; reason?: unknown }): void;
    /** Reactive macro: write `value` at `path`. */
    SET(path: string, value: unknown): void;
    /** Reactive macro: read the datum at `path`. */
    GET(path: string): unknown;
    /** Reactive macro: write `value` at `path` without triggering reactions. */
    PUT(path: string, value: unknown): void;
    /** Reactive macro: fire an event at `path`; the payload defaults to `true`. */
    FIRE(path: string, value?: unknown): void;
}

/**
 * Bag whose tag names dispatch to the active builder. The class of its
 * nodes is {@link SourceBagNode}. Serializes on the tytx wire as `SourceBag`.
 */
export class SourceBag extends Bag {
    /**
     * Create a bag owned by a builder.
     *
     * @param source Initial content, as accepted by `Bag`.
     * @param builder The builder that owns this bag.
     */
    constructor(source?: unknown, builder?: BuilderBase | null);
    /** The node class used by this bag. */
    readonly nodeClass: typeof SourceBagNode;
    /**
     * Attach runtime-only builder ownership to a deserialized Source.
     * Identity is preserved; only genuine {@link SourceBag} branches take part.
     *
     * @param builder The builder to bind.
     * @returns This bag.
     * @throws {Error} When no builder is given or the graph is cyclic or shared.
     */
    bindBuilder(builder: BuilderBase): this;
}

/** Options of {@link BuilderBase.validateNode}. */
export interface ValidateNodeOptions {
    /** Value to validate instead of the node value. */
    value?: unknown;
    /** Attributes to validate instead of the node attributes. */
    attrs?: SourceAttributes;
    /** Child tags to validate instead of the node children. */
    childTags?: string[];
}

/** Options of {@link BuilderBase.render}. Further options go to the renderer. */
export interface RenderOptions {
    /** Render mode; defaults to the dialect's default mode. */
    mode?: string | null;
    /** Destination: a function, an object with `write(text)` or `full(text)`, or `false` to return only the value. */
    target?: unknown;
    /** Renderer options, such as `pretty`, `depthOffset` or `docHeader`. */
    [option: string]: unknown;
}

/**
 * Base of every dialect: owns a grammar, the `source` tree and the `data`
 * store, and exposes the fluent API that builds the Source.
 *
 * A dialect subclass sets `static _name` and `static _defaultRenderMode`,
 * calls {@link BuilderBase.defineGrammar} in a static block and registers
 * itself with {@link BuilderBase.registerBuilder}.
 */
export class BuilderBase {
    /** SourceBag class instantiated for this builder's Source. */
    static _sourceClass: typeof SourceBag;
    /** Registered name of the dialect. */
    static _name: string | undefined;
    /** Render mode used when none is requested. */
    static _defaultRenderMode: string | undefined;
    /** Attribute name prefixes kept out of the rendered attributes. */
    static retainedAttrPrefixes?: string[];
    /** Names of the methods that act as containers (source generated at call time). */
    static containers?: string[];
    /** Names of the methods that act as render-time components. */
    static components?: string[];

    /**
     * Register a dialect under its static `_name`.
     *
     * @param BuilderClass A subclass of {@link BuilderBase}.
     * @returns The registered class.
     * @throws {TypeError} When the class is not a builder or has no name.
     * @throws {Error} When the name belongs to another class.
     */
    static registerBuilder<T extends typeof BuilderBase>(BuilderClass: T): T;
    /**
     * Return the class registered under `name`.
     *
     * @param name The dialect name.
     * @throws {Error} When no builder is registered with that name.
     */
    static getBuilderClass(name: string): typeof BuilderBase;
    /**
     * Compile a `builder_grammar` document into the class schema, merging it
     * with the grammar of the parent class. Call it in a static block.
     *
     * @param doc The grammar document.
     */
    static defineGrammar(doc: GrammarDocument): void;

    /** Instance name; defaults to the class `_name`. */
    name: string;
    /** The datastore of the document. */
    data: Bag;
    /** The Source payload built by {@link BuilderBase.main}. */
    readonly source: SourceBag;
    /** Fragments retained by {@link BuilderBase.materialize}, keyed by render mode. */
    materialized: { [mode: string]: unknown };

    /**
     * Create a builder with an empty Source and an empty datastore.
     *
     * @param name Instance name; defaults to the class `_name`.
     */
    constructor(name?: string | null);

    /** Fluent handle of the Source root. */
    readonly root: SourceHandle;
    /** The compiled element schema, keyed by tag name. */
    readonly schema: { [tag: string]: { [key: string]: unknown } };
    /** Map from lowercase authoring name to canonical tag name. */
    readonly schemaTagNames: { [lowercase: string]: string };
    /** Sources searched to resolve a data-element function. */
    readonly dataLogic: unknown[];
    /** XML renderer, available to every dialect. */
    readonly renderer_xml: XmlRenderer;

    /**
     * Return the stable fluent handle of a raw bag or node.
     *
     * @param target A {@link SourceBag}, {@link SourceBagNode} or handle.
     * @throws {TypeError} When the target is none of those.
     */
    wrapSource(target: SourceBag | SourceBagNode | SourceHandle): SourceHandle;
    /**
     * Return the builder instance of a registered dialect, sharing this
     * builder's datastore.
     *
     * @param name A registered dialect name.
     */
    getSubbuilder(name: string): BuilderBase;
    /**
     * Name of the container method for `name`, or `null`.
     *
     * @param name Case-insensitive container name.
     */
    containerMethod(name: string): string | null;
    /**
     * Name of the component method for `name`, or `null`.
     *
     * @param name Case-insensitive component name.
     */
    componentMethod(name: string): string | null;
    /**
     * Canonical tag name for an authoring name (case-insensitive, with or
     * without the dialect prefix), or `null` when unknown.
     *
     * @param name The authoring name.
     */
    schemaTag(name: string): string | null;
    /**
     * Compose a grammar document onto this instance, validating it entirely
     * before publishing the new schema.
     *
     * @param doc The grammar document.
     * @param options.replace Replace the grammar instead of composing onto it.
     * @returns This builder.
     */
    loadGrammar(doc: GrammarDocument, options?: { replace?: boolean }): this;
    /**
     * Validate a value and attributes against the element `tag`.
     *
     * @param tag The element name.
     * @param value The node value.
     * @param attrs The node attributes.
     * @returns `true` when valid.
     * @throws {Error} When the element is unknown or a value is invalid.
     */
    validateNodeValues(tag: string, value: unknown, attrs?: SourceAttributes): true;
    /**
     * Validate a source node, including its children when it has any.
     *
     * @param node The node to validate.
     * @param options Overrides for value, attributes and child tags.
     * @returns `true` when valid.
     * @throws {Error} When the node violates the grammar.
     */
    validateNode(node: SourceBagNode, options?: ValidateNodeOptions): true;
    /**
     * Validate a list of child tags for a parent tag.
     *
     * @param tag The parent element.
     * @param childTags The child tags.
     * @param options.includeMinimum Also report tags below their minimum cardinality.
     * @returns The tags that miss their minimum cardinality.
     */
    validateChildren(tag: string, childTags: string[], options?: { includeMinimum?: boolean }): string[];
    /**
     * Validate an element against its semantic parent. A `null` parent means
     * the element sits at the Source root.
     *
     * @param tag The element.
     * @param parentTag The parent element, or `null`.
     * @returns `true` when allowed.
     * @throws {Error} When the parent is not allowed.
     */
    validateParent(tag: string, parentTag?: string | null): true;
    /**
     * Validate the whole Source for unmet minimum cardinalities.
     *
     * @returns `[path, missingTags]` entries.
     */
    validateSource(): Array<[string, string[]]>;
    /**
     * Create a child on a bag. The fluent API converges here.
     *
     * @param bag The parent bag.
     * @param tag The element name.
     * @param value The node value.
     * @param attrs The node attributes.
     * @returns The new node.
     */
    bagCall(bag: SourceBag, tag: string, value: unknown, attrs: SourceAttributes): SourceBagNode;
    /**
     * Create a child on a node, promoting its value to a branch if needed.
     *
     * @param node The parent node.
     * @param tag The element name.
     * @param value The node value.
     * @param attrs The node attributes.
     * @returns The new node.
     */
    commandOnNode(node: SourceBagNode, tag: string, value: unknown, attrs: SourceAttributes): SourceBagNode;
    /**
     * Hook for dialects that keep a scalar while promoting a node to a branch.
     * The default sets the branch as the node value.
     *
     * @param node The node being promoted.
     * @param oldValue The previous scalar value.
     * @param branch The new branch.
     */
    promoteNodeValue(node: SourceBagNode, oldValue: unknown, branch: SourceBag): void;
    /**
     * Validate and insert a child element into a bag.
     *
     * @param bag The parent bag.
     * @param tag The element name.
     * @param value The node value.
     * @param attrs The node attributes.
     * @param parentOverride Parent node to use instead of the bag's own.
     * @returns The new node.
     * @throws {Error} When the element violates the grammar.
     */
    setChild(bag: SourceBag, tag: string, value: unknown, attrs: SourceAttributes, parentOverride?: SourceBagNode | null): SourceBagNode;
    /**
     * Source node carrying `nodeId`, wrapped as a fluent handle.
     *
     * @param nodeId The `node_id` attribute value.
     * @throws {Error} When no node carries that id.
     */
    nodeById(nodeId: string): SourceHandle;
    /**
     * Resolve the pointers and values of a node.
     *
     * @param node The node to resolve.
     * @returns `[runtimeValue, runtimeAttributes]`.
     */
    runtimeValues(node: SourceBagNode): [unknown, SourceAttributes];
    /**
     * Stable per-document identity of a node, assigned on request.
     *
     * @param node The node.
     * @returns The id, or `null` for a node outside the document Source.
     */
    targetId(node: SourceBagNode): string | null;
    /**
     * Execute data-element nodes (setters, formulas, controllers).
     *
     * @param nodes The nodes to execute, in order.
     */
    computeLogic(nodes: Iterable<SourceBagNode>): void;
    /**
     * Lifecycle hook: seed the datastore before {@link BuilderBase.main}.
     *
     * @param data The datastore.
     */
    setup(data: Bag): void;
    /**
     * Lifecycle hook: build the Source. A bare builder throws; subclasses override.
     *
     * @param root Fluent handle of the Source root.
     */
    main(root: SourceHandle): void;
    /** Run the static lifecycle: setup, components, main, data-elements. */
    create(): void;
    /**
     * Return the renderer of a render mode.
     *
     * @param mode The mode; defaults to the dialect's default mode.
     * @throws {Error} When the dialect has no renderer for the mode.
     */
    getRenderer(mode?: string | null): RendererBase;
    /**
     * Walk the Source and retain the fragments without delivering them.
     *
     * @param mode The render mode.
     * @param opts Renderer options.
     * @returns The fragments.
     */
    materialize(mode?: string | null, opts?: { [option: string]: unknown }): unknown[];
    /**
     * Register the destination used by {@link BuilderBase.render} for a mode.
     *
     * @param target The destination.
     * @param mode The render mode.
     */
    setRenderTarget(target: unknown, mode?: string | null): void;
    /**
     * Materialize the selected representation, then deliver it.
     *
     * @param options Mode, target and renderer options.
     * @returns The rendered text, or `null` when delivered to a target.
     */
    render(options?: RenderOptions): unknown;
}

/**
 * Base of every renderer: walks the Source, resolves runtime values,
 * expands static components and hands each node to the dialect hook
 * {@link RendererBase.renderedItem}.
 */
export class RendererBase {
    /** Kind of value produced; `'string'` for text renderers. */
    static renderType: string;
    /** Render mode name of the dialect. */
    static mode: string | null;

    /**
     * Create a renderer for a builder.
     *
     * @param builder The builder whose Source is rendered.
     */
    constructor(builder: BuilderBase);

    /** The builder this renderer serves. */
    readonly builder: BuilderBase;
    /** Kind of value produced. */
    readonly renderType: string;
    /** Render mode name. */
    readonly mode: string | null;

    /**
     * Register the renderer responsible for nodes of `builder`.
     *
     * @param builder The builder.
     * @param renderer Its renderer.
     */
    addRender(builder: BuilderBase, renderer: RendererBase): void;
    /**
     * Return the renderer responsible for nodes of `builder`.
     *
     * @param builder The builder.
     */
    getRender(builder: BuilderBase): RendererBase;
    /**
     * Render a node, producing its dialect-defined value, or `null` for a
     * transparent node.
     *
     * @param node The node.
     * @param opts Renderer options.
     */
    render(node: SourceBagNode, opts?: { [option: string]: unknown }): unknown;
    /**
     * Render each child of a bag and collect the fragments.
     *
     * @param nodes The bag whose children are rendered.
     * @param opts Renderer options.
     */
    renderChildren(nodes: SourceBag, opts?: { [option: string]: unknown }): unknown[];
    /**
     * Normalize the Source before the top-level walk. Identity by default.
     *
     * @param source The Source.
     */
    preprocess(source: SourceBag): SourceBag;
    /**
     * Dialect fragment for a node. Concrete renderers override it.
     *
     * @param node The node.
     * @param item The rendered content: string, value or fragments.
     * @param runtimeAttrs The resolved attributes.
     * @param opts Renderer options, including the resolved `tag`.
     * @throws {Error} When not overridden.
     */
    renderedItem(node: SourceBagNode, item: unknown, runtimeAttrs: SourceAttributes, opts?: { tag?: string; [option: string]: unknown }): unknown;
    /**
     * Adapt the attribute dictionary to the dialect. Identity by default.
     *
     * @param attrs The attributes.
     */
    adaptAttrs(attrs: SourceAttributes): SourceAttributes;
    /**
     * Strip this dialect's own `<name>_` prefix from `what`.
     *
     * @param what The name.
     */
    adapt(what: string): string;
    /**
     * Compose the fragments and deliver the result.
     *
     * @param result The fragments.
     * @param target A function, an object with `write(text)` or `full(text)`, or `null` to return the text.
     * @param opts Renderer options.
     * @returns The text, or `null` when delivered to a target.
     * @throws {TypeError} When the target is unsupported.
     */
    finalize(result: unknown, target?: unknown, opts?: { [option: string]: unknown }): string | null;
}

/** Portable XML renderer: the shared render mode of every dialect. */
export class XmlRenderer extends RendererBase {
    /**
     * Render one node as an XML element.
     *
     * @param node The node.
     * @param item The content.
     * @param runtimeAttrs The resolved attributes.
     * @param opts The tag, `pretty` and `depthOffset` options.
     */
    renderedItem(node: SourceBagNode, item: unknown, runtimeAttrs: SourceAttributes,
        opts?: { tag?: string; pretty?: boolean; depthOffset?: number }): string;
    /**
     * Compose the fragments and deliver the document.
     *
     * @param result The fragments.
     * @param target The destination, or `null` to return the text.
     * @param opts.docHeader `true` prepends the XML declaration; a string is prepended as is.
     */
    finalize(result: unknown, target?: unknown, opts?: { docHeader?: boolean | string | null }): string | null;
}

/** Static HTML5 text renderer. No browser or DOM dependency. */
export class HtmlRenderer extends RendererBase {
    /**
     * Render one node as an HTML element.
     *
     * @param node The node.
     * @param item The content.
     * @param runtimeAttrs The resolved attributes.
     * @param opts The tag and the `xml`, `pretty`, `depthOffset` and `includeDatapath` options.
     */
    renderedItem(node: SourceBagNode, item: unknown, runtimeAttrs: SourceAttributes,
        opts?: { tag?: string; xml?: boolean; pretty?: boolean; depthOffset?: number; includeDatapath?: boolean }): string;
    /**
     * Adapt attributes to HTML, converting CSS keyword arguments and macros
     * into a `style` attribute.
     *
     * @param attrs The attributes.
     */
    adaptAttrs(attrs: SourceAttributes): SourceAttributes;
}

/** Static SVG text renderer. No browser or DOM dependency. */
export class SvgRenderer extends XmlRenderer {
    /**
     * Adapt grammar attribute names to SVG wire names.
     *
     * @param attrs The attributes.
     */
    adaptAttrs(attrs: SourceAttributes): SourceAttributes;
}

/**
 * Adapt native grammar attribute names to SVG wire names, turning
 * underscores into hyphens for the kebab-case presentation attributes.
 *
 * @param attrs The attributes.
 */
export function svgAttributes(attrs: SourceAttributes | null | undefined): SourceAttributes;

/** DOM-free HTML5 builder. */
export class HtmlBuilder extends BuilderBase {
    /** HTML renderer of this builder. */
    readonly renderer_html: HtmlRenderer;
}

/** DOM-free SVG builder. */
export class SvgBuilder extends BuilderBase {
    /** SVG renderer of this builder. */
    readonly renderer_svg: SvgRenderer;
}

/**
 * Resolve the emitted tag consistently across renderers.
 *
 * @param sourceTag The tag of the Source node.
 * @param options.renderTag Explicit tag that wins over `sourceTag`.
 * @param options.ns Namespace prefix to apply.
 * @param options.dialectName Dialect name whose `<name>_` prefix is stripped.
 */
export function resolveRenderTag(
    sourceTag: string | null | undefined,
    options?: { renderTag?: string | null; ns?: string | null; dialectName?: string | null },
): string | null | undefined;

/**
 * Ordered composition of `builder_grammar` JSON documents.
 *
 * A document applied after another replaces, entirely, every element and
 * abstract it names; entries it does not name are inherited unchanged.
 * Grammar metadata merges key by key, and a `null` value keeps the earlier one.
 */
export class Collection {
    /**
     * Validate and copy a complete grammar document.
     *
     * @param document A complete grammar document.
     * @throws {TypeError} When the document is not a valid `builder_grammar` 1.1.
     */
    constructor(document: GrammarDocument);
    /**
     * Compose a later document onto this collection.
     *
     * @param document The later document.
     * @returns This collection.
     */
    update(document: GrammarDocument): this;
    /** Export an independent copy of the composed document as JSON data. */
    toDocument(): GrammarDocument;
}
