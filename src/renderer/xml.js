// Copyright 2025 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
/** XmlRenderer — the shared portable XML render mode. */
import { RendererBase } from './base.js';

export class XmlRenderer extends RendererBase {
    static mode = 'xml';

    renderedItem(node, item, runtimeAttrs, {
        tag, pretty = false, depthOffset = 0,
    } = {}) {
        const attrs = this._formatAttrs(runtimeAttrs);
        const indent = pretty ? '  '.repeat(this._nodeDepth(node, depthOffset)) : '';
        const newline = pretty ? '\n' : '';
        if (Array.isArray(item)) {
            const body = this._composeStringFragments(item);
            return `${indent}<${tag}${attrs}>${newline}${body}${indent}</${tag}>${newline}`;
        }
        if (item === null || item === undefined) {
            return `${indent}<${tag}${attrs}></${tag}>${newline}`;
        }
        return `${indent}<${tag}${attrs}>${this._escapeText(item)}</${tag}>${newline}`;
    }

    finalize(result, target = null, { docHeader = null } = {}) {
        let text = this._composeStringFragments(result);
        if (docHeader === true) {
            text = `<?xml version='1.0' encoding='UTF-8'?>${text}`;
        } else if (typeof docHeader === 'string') {
            text = docHeader + text;
        }
        return super.finalize(text, target);
    }

    _formatAttrs(attrs) {
        return Object.entries(attrs || {}).map(([name, value]) => {
            const outputName = name.startsWith('xmlns_')
                ? `xmlns:${name.slice('xmlns_'.length)}`
                : name;
            return ` ${outputName}="${this._escapeAttr(value)}"`;
        }).join('');
    }
}
