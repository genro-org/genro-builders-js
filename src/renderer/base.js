// Copyright 2025 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
/**
 * RendererBase — JS port of renderer/base.py.
 *
 * The universal walk: `render(node)` resolves the node's runtime values,
 * dispatches to the renderer of the node's own dialect (`getRender`),
 * resolves the tag/attrs (`_handleMeta` + `adaptAttrs`), recurses into
 * children (`renderChildren`), and hands off to the dialect hook
 * `renderedItem`. Concrete dialects define the output type and finalization.
 *
 * Static component expansion is part of the walk. Live update planning and
 * DOM patch bookkeeping belong to hosts such as Gramlot, not this renderer.
 */
import { Bag } from '@jsr/genro__bag';
import { SourceBag, wrapSource } from '../source-bag.js';
import { resolveRenderTag } from '../utils.js';

export class RendererBase {
    static renderType = 'string';
    static mode = null;

    constructor(builder) {
        this._builder = builder;
        // "renderer instance for builder X" cache (keyed by the builder
        // object). The renderer registers itself for its own builder.
        this.renders = new Map([[builder, this]]);
    }

    get builder() {
        return this._builder;
    }

    get renderType() {
        return this.constructor.renderType;
    }

    get mode() {
        return this.constructor.mode;
    }

    /** Seed the cache with a renderer for `builder`. */
    addRender(builder, renderer) {
        this.renders.set(builder, renderer);
    }

    /** Return the renderer responsible for nodes of `builder`. */
    getRender(builder) {
        const rn = this.renders.get(builder);
        if (rn !== undefined) {
            return rn;
        }
        const prop = builder.getRenderer();
        this.renders.set(builder, prop);
        return prop;
    }

    /** Walk a node and produce its dialect-defined rendered value. */
    render(node, opts = {}) {
        const builder = node.builder;
        let [item, ra] = builder.runtimeValues(node);
        if (node._getMeta('data_element')) {
            return null;   // transparent: the walk never emits, absence is null
        }
        if (node._getMeta('component')) {
            return this._renderComponent(node, ra, opts);
        }
        const renderer = this.getRender(builder);
        let tag;
        [tag, ra] = renderer._handleMeta(node, ra);
        if (!node._getMeta('subbuilder')) {
            ra = renderer.adaptAttrs(ra);
        }
        if (node.value instanceof SourceBag) item = this.renderChildren(node.value, opts);
        return renderer.renderedItem(node, item, ra, { tag, ...opts });
    }

    /** Render each child and collect the fragments (drop transparent nulls). */
    renderChildren(nodes, opts = {}) {
        const fragments = [];
        for (const child of nodes.getNodes()) {
            const frag = this.render(child, opts);
            if (frag === null) {
                continue;
            }
            if (Array.isArray(frag)) {
                fragments.push(...frag);   // iterate component: N blocks
            } else {
                fragments.push(frag);
            }
        }
        return fragments;
    }

    // --- @component expansion (render-time) --------------------------

    /** Expand a component node and render the expansion in its place.
     *  The body (kept on the builder) receives a fresh throw-away root and
     *  builds exactly ONE tree. Three forms: params (one block), `store`
     *  (one block anchored to a record), `iterate` (N blocks, one per
     *  child of the collection). */
    _renderComponent(node, runtimeAttrs, opts) {
        const [body, iterable, anchor, bodyKwargs] = this._expansionInputs(node, runtimeAttrs);
        if (!Object.hasOwn(node.getAttr(), 'iterate')) {
            return this._expandBlock(node, body, anchor, bodyKwargs, opts);
        }
        if (iterable == null) {
            return [];   // empty collection → zero blocks (data-driven stop)
        }
        if (!(iterable instanceof Bag)) {
            throw new TypeError(
                `component '${node.nodeTag}': iterate must resolve to a Bag, got `
                + `${iterable?.constructor?.name || typeof iterable}`,
            );
        }
        // one expansion per child, each getting only the child's label.
        return iterable.getNodes().map(
            (child) => this._expandBlock(
                node, body, anchor, { node_label: child.label }, opts,
            ),
        );
    }

    /** The expansion prep: (body, iterable, anchor, bodyKwargs). Reads the
     *  data anchors RAW (store/iterate), drops the machinery kwargs, and
     *  passes reactive-pointer kwargs THROUGH as absolutized pointers
     *  (CMP.4: the address must reach the node the body builds). */
    _expansionInputs(node, runtimeAttrs) {
        const builder = node.builder;
        const method = builder.componentMethod(node.nodeTag);
        const body = method && builder[method];
        if (typeof body !== 'function') {
            throw new Error(`component '${node.nodeTag}' has no implementation`);
        }
        const iterable = runtimeAttrs.iterate;
        delete runtimeAttrs.iterate;
        delete runtimeAttrs.store;
        let anchor = node.getAttr('iterate') || node.getAttr('store');
        if (anchor != null) {
            if (node.pointerType(anchor)) {
                anchor = anchor.slice(1);
            }
            if (anchor.startsWith('.')) {
                anchor = node._composeRelativeDatapath(anchor, anchor);
            }
        } else {
            anchor = null;
        }
        for (const name of Object.keys(runtimeAttrs)) {
            const raw = node.getAttr(name);
            if (node.pointerType(raw) === '^') {
                runtimeAttrs[name] = `^${node.absDatapath(raw)}`;
            }
        }
        return [body, iterable, anchor, runtimeAttrs];
    }

    /** ONE expansion: throw-away root, body call, single-tree check, render. */
    _expandBlock(node, body, anchor, bodyKwargs, opts) {
        const root = node.builder._expansionRoot(anchor);
        body.call(node.builder, wrapSource(root), bodyKwargs);
        const roots = root.getNodes();
        if (roots.length !== 1) {
            throw new Error(
                `component '${node.nodeTag}' must build a tree, not a forest: `
                + `${roots.length} root nodes`,
            );
        }
        const expansionOpts = {
            ...opts,
            depthOffset: this._nodeDepth(node, opts.depthOffset || 0),
        };
        return this.render(roots[0], expansionOpts);
    }

    /** Normalize the source before the top-level walk. Identity by default. */
    preprocess(source) {
        return source;
    }

    /** Dialect-specific fragment for `node`. Concrete renderers override. */
    renderedItem(_node, _item, _runtimeAttrs, _opts) {
        throw new Error(`${this.constructor.name} does not implement renderedItem`);
    }

    /** Resolve render_tag / render_attributes / ns into a ready tag+attrs. */
    _handleMeta(node, runtimeAttrs) {
        const [renderTag, renderAttributes] = node._getMeta('render_tag,render_attributes');
        const tag = resolveRenderTag(node.nodeTag, {
            renderTag, ns: node.getAttr('ns'),
            dialectName: node.builder?.constructor._name,
        });
        if (!tag) {
            throw new Error(
                `node ${node.label} has no tag to render (no render_tag, no node_tag)`,
            );
        }
        if (renderAttributes) {
            runtimeAttrs = { ...runtimeAttrs, ...renderAttributes };
        }
        return [tag, runtimeAttrs];
    }

    /** Dialect adaptation of the attribute dict. Identity by default. */
    adaptAttrs(attrs) {
        return attrs;
    }

    /** Strip this dialect's own `<name>_` prefix from `what`. */
    adapt(what) {
        const prefix = `${this.builder.constructor._name}_`;
        return what.startsWith(prefix) ? what.slice(prefix.length) : what;
    }

    /** Compose string fragments and deliver the complete result. */
    finalize(result, target = null, _opts = {}) {
        const text = this._composeStringFragments(result);
        if (target === null || target === undefined) {
            return text;
        }
        if (typeof target === 'string') {
            throw new TypeError(
                'string render targets require filesystem support, which is unavailable '
                + 'in the portable renderer; pass a callable or writable target instead',
            );
        }
        if (typeof target.full === 'function' && typeof target.write !== 'function') {
            target.full(text);
            return null;
        }
        if (typeof target.write === 'function') {
            target.write(text);
            return null;
        }
        if (typeof target === 'function') {
            target(text);
            return null;
        }
        throw new TypeError(
            'render target must be writable (.write), callable, or expose .full',
        );
    }

    /** Join string fragments without silently coercing object output. */
    _composeStringFragments(result) {
        if (!Array.isArray(result)) {
            return result;
        }
        if (result.some(fragment => typeof fragment !== 'string')) {
            throw new TypeError(
                'String composition requires string fragments; '
                + 'object renderers must define their own composition',
            );
        }
        return result.join('');
    }

    /** Escape a text value for safe inclusion in an XML/HTML body. */
    _escapeText(value) {
        return String(value)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;');
    }

    /** Escape an attribute value, including double quotes. */
    _escapeAttr(value) {
        return this._escapeText(value).replaceAll('"', '&quot;');
    }

    /** Wrapper-rooted depth of a source node, shifted for expansions. */
    _nodeDepth(node, depthOffset = 0) {
        const fullpath = node.fullpath || '';
        const dots = (fullpath.match(/\./g) || []).length;
        return Math.max(dots - 1, 0) + depthOffset;
    }
}
