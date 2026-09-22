// Copyright 2025 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
/** Static HTML5 text renderer. No browser or DOM dependency. */
import { RendererBase } from './base.js';
import { formatDisplay } from './display-format.js';

const RAW_TEXT_TAGS = new Set(['style', 'script']);
const BOOLEAN_ATTRS = new Set([
    'allowfullscreen', 'async', 'autofocus', 'autoplay', 'checked', 'controls',
    'default', 'defer', 'disabled', 'formnovalidate', 'inert', 'ismap',
    'itemscope', 'loop', 'multiple', 'muted', 'nomodule', 'novalidate', 'open',
    'playsinline', 'readonly', 'required', 'reversed', 'selected',
]);
const STYLE_ROOTS = new Set([
    'width', 'height', 'top', 'left', 'right', 'bottom', 'padding', 'margin',
    'border', 'position', 'display', 'overflow', 'float', 'clear', 'resize',
    'z_index', 'min_width', 'min_height', 'max_width', 'max_height', 'color',
    'background', 'font', 'text', 'line_height', 'white_space',
    'vertical_align', 'flex', 'gap', 'row_gap', 'column_gap', 'grid',
    'align_content', 'justify_content', 'align_items', 'justify_items',
    'visibility', 'opacity', 'cursor',
]);
const MACRO_NAMES = new Set([
    'rounded', 'gradient', 'shadow', 'transform', 'transition', 'zoom', 'filter',
]);

const cssValue = value => value === true ? 'true' : value === false ? 'false' : String(value);
const px = value => typeof value === 'number' && Number.isFinite(value) ? `${value}px` : String(value);

function isStyleAttr(name) {
    if (STYLE_ROOTS.has(name)) return true;
    for (const root of STYLE_ROOTS) if (name.startsWith(`${root}_`)) return true;
    return false;
}

function parseStyle(value) {
    const result = new Map();
    if (!value) return result;
    const declarations = [];
    let start = 0;
    let quote = null;
    let escaped = false;
    let comment = false;
    let depth = 0;
    const text = String(value);
    for (let index = 0; index < text.length; index += 1) {
        const char = text[index];
        const next = text[index + 1];
        if (comment) {
            if (char === '*' && next === '/') {
                comment = false;
                index += 1;
            }
            continue;
        }
        if (escaped) {
            escaped = false;
            continue;
        }
        if (char === '\\') {
            escaped = true;
            continue;
        }
        if (quote) {
            if (char === quote) quote = null;
            continue;
        }
        if (char === '"' || char === "'") {
            quote = char;
        } else if (char === '/' && next === '*') {
            comment = true;
            index += 1;
        } else if ('([{'.includes(char)) {
            depth += 1;
        } else if (')]}'.includes(char) && depth > 0) {
            depth -= 1;
        } else if (char === ';' && depth === 0) {
            declarations.push(text.slice(start, index));
            start = index + 1;
        }
    }
    declarations.push(text.slice(start));
    for (const raw of declarations) {
        const entry = raw.trim();
        if (!entry) continue;
        const colon = entry.indexOf(':');
        if (colon < 0) throw new TypeError(`malformed style declaration '${entry}'`);
        result.set(entry.slice(0, colon).trim(), entry.slice(colon + 1).trim());
    }
    return result;
}

export class HtmlRenderer extends RendererBase {
    static mode = 'html';

    renderedItem(node, item, runtimeAttrs, {
        tag, xml = true, pretty = false, depthOffset = 0, includeDatapath = false,
    } = {}) {
        const parent = node.parentNode;
        if (parent?._getMeta('subbuilder') === 'html') {
            runtimeAttrs = {
                xmlns: 'http://www.w3.org/1999/xhtml',
                ...runtimeAttrs,
            };
        }
        const { format, mask, locale, places, dtype, ...htmlAttrs } = runtimeAttrs;
        if (!Array.isArray(item) && (format != null || mask != null || places != null)) {
            item = formatDisplay(item, {
                format, mask, places, dtype, locale: this._displayLocale(node, locale),
            });
        }
        let attrs = this._formatAttrs(htmlAttrs);
        if (includeDatapath) {
            if (!Object.hasOwn(runtimeAttrs, 'id')) {
                const id = this.builder.targetId(node);
                if (id !== null) attrs += ` id="${this._htmlAttrValue(id)}"`;
            }
            for (const [name, value] of Object.entries(node.getAttr())) {
                if (node.pointerType(value)) {
                    attrs += ` data-${this.adapt(name)}-pointer="${this._htmlAttrValue(node.absDatapath(value))}"`;
                }
            }
        }
        const indent = pretty ? '  '.repeat(this._nodeDepth(node, depthOffset)) : '';
        const newline = pretty ? '\n' : '';
        if (node._getMeta('void')) return `${indent}<${tag}${attrs}${xml ? '/' : ''}>${newline}`;
        if (Array.isArray(item)) {
            const body = this._composeStringFragments(item);
            return `${indent}<${tag}${attrs}>${newline}${body}${indent}</${tag}>${newline}`;
        }
        if (item === null || item === undefined) return `${indent}<${tag}${attrs}></${tag}>${newline}`;
        const text = typeof item === 'string' && item.endsWith('::HTML')
            ? item.slice(0, -6)
            : RAW_TEXT_TAGS.has(tag) ? String(item) : this._escapeText(item);
        return `${indent}<${tag}${attrs}>${text}</${tag}>${newline}`;
    }

    /** Resolve an inherited locale in the ancestor's own Data scope. */
    _displayLocale(node, locale) {
        if (locale) return locale;
        for (let parent = node.parentNode; parent; parent = parent.parentNode) {
            const raw = parent.getAttr('locale');
            if (raw == null) continue;
            const value = parent.pointerType(raw)
                ? parent.data.getItem(parent.absDatapath(raw)) : raw;
            if (value) return value;
        }
        return undefined; // Intl uses the host locale; no browser dependency.
    }

    /** Python-compatible HTML attribute and Genro CSS kwarg adaptation. */
    adaptAttrs(attrs) {
        const out = {};
        const styleAttrs = {};
        for (const [rawName, value] of Object.entries(attrs || {})) {
            if (rawName.startsWith(`${this.builder.constructor._name}_`)) {
                out[this.adapt(rawName)] = value;
            } else if (rawName === 'dtype') {
                out.dtype = value;
            } else if (this.builder.constructor.retainedAttrPrefixes
                .some(prefix => rawName.startsWith(prefix))) {
                continue;
            } else if (this._isStyleContribution(rawName)) {
                styleAttrs[rawName] = value;
            } else {
                out[rawName] = value;
            }
        }
        const style = this._adaptStyle(styleAttrs);
        if (style) out.style = style;
        return out;
    }

    _isStyleContribution(name) {
        if (name === 'style' || name.startsWith('style_') || MACRO_NAMES.has(name)) return true;
        const head = name.includes('_') ? name.slice(0, name.indexOf('_')) : null;
        return (head !== null && MACRO_NAMES.has(head)) || isStyleAttr(name);
    }

    _adaptStyle(attrs) {
        // Seed the fallback first: explicit CSS kwargs always win.
        const css = parseStyle(attrs.style);
        const values = new Map();
        const subs = new Map();
        for (const [name, value] of Object.entries(attrs)) {
            if (name === 'style') continue;
            if (name.startsWith('style_')) {
                css.set(name.slice(6).replaceAll('_', '-'), cssValue(value));
            } else if (MACRO_NAMES.has(name)) {
                values.set(name, value);
            } else {
                const split = name.indexOf('_');
                const head = split < 0 ? name : name.slice(0, split);
                if (split >= 0 && MACRO_NAMES.has(head)) {
                    if (!subs.has(head)) subs.set(head, {});
                    subs.get(head)[name.slice(split + 1)] = value;
                } else {
                    css.set(name.replaceAll('_', '-'), cssValue(value));
                }
            }
        }
        for (const name of MACRO_NAMES) {
            if (values.has(name) || subs.has(name)) {
                this[`_macro_${name}`](values.get(name), subs.get(name) || {}, css);
            }
        }
        return [...css].map(([key, value]) => `${key}: ${value}`).join('; ');
    }

    _formatAttrs(attrs) {
        const parts = [];
        for (const [name, value] of Object.entries(attrs || {})) {
            if (BOOLEAN_ATTRS.has(name)) {
                if (value) parts.push(` ${name}`);
            } else {
                parts.push(` ${name}="${this._htmlAttrValue(value)}"`);
            }
        }
        return parts.join('');
    }

    _htmlAttrValue(value) {
        const text = value === true ? 'true' : value === false ? 'false' : String(value);
        return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;').replaceAll('"', '&quot;');
    }

    _macro_rounded(value, subs, css) {
        const corners = value === undefined ? {} : {
            top_left: value, top_right: value, bottom_left: value, bottom_right: value,
        };
        for (const [name, subValue] of Object.entries(subs)) {
            if (name === 'top' || name === 'bottom') {
                corners[`${name}_left`] = subValue; corners[`${name}_right`] = subValue;
            } else if (name === 'left' || name === 'right') {
                corners[`top_${name}`] = subValue; corners[`bottom_${name}`] = subValue;
            } else if (['top_left', 'top_right', 'bottom_left', 'bottom_right'].includes(name)) {
                corners[name] = subValue;
            } else throw new TypeError(`rounded: unknown sub-kwarg '${name}'`);
        }
        for (const [corner, cornerValue] of Object.entries(corners)) {
            css.set(`border-${corner.replaceAll('_', '-')}-radius`, px(cornerValue));
        }
    }

    _macro_transform(value, subs, css) {
        const parts = value === undefined ? [] : [String(value)];
        for (const [name, subValue] of Object.entries(subs)) {
            if (name === 'rotate') parts.push(`rotate(${subValue}deg)`);
            else if (name === 'scale' || name === 'translate') parts.push(`${name}(${subValue})`);
            else if (name === 'translate_x') parts.push(`translateX(${px(subValue)})`);
            else if (name === 'translate_y') parts.push(`translateY(${px(subValue)})`);
            else if (name === 'skew_x') parts.push(`skewX(${subValue}deg)`);
            else if (name === 'skew_y') parts.push(`skewY(${subValue}deg)`);
            else parts.push(`${name.replaceAll('_', '-')}(${subValue})`);
        }
        if (parts.length) css.set('transform', parts.join(' '));
    }

    _macro_filter(value, subs, css) {
        const parts = value === undefined ? [] : [String(value)];
        for (const [name, subValue] of Object.entries(subs)) {
            if (name === 'rotate') parts.push(`hue-rotate(${subValue}deg)`);
            else if (name === 'blur') parts.push(`blur(${px(subValue)})`);
            else if (name === 'drop_shadow') parts.push(`drop-shadow(${subValue})`);
            else parts.push(`${name.replaceAll('_', '-')}(${subValue})`);
        }
        if (parts.length) css.set('filter', parts.join(' '));
    }

    _macro_transition(value, subs, css) {
        if (value !== undefined) css.set('transition', String(value));
        for (const [name, subValue] of Object.entries(subs)) css.set(`transition-${name.replaceAll('_', '-')}`, String(subValue));
    }
    _macro_zoom(value, _subs, css) { if (value !== undefined) css.set('zoom', String(value)); }
    _macro_shadow(value, subs, css) {
        if (value !== undefined) css.set('box-shadow', String(value));
        for (const [name, subValue] of Object.entries(subs)) css.set(`box-shadow-${name.replaceAll('_', '-')}`, String(subValue));
    }
    _macro_gradient(value, _subs, css) { if (value !== undefined) css.set('background-image', String(value)); }
}
