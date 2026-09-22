// Copyright 2026 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
import {parseCardinality} from './grammar-loader.js';

/** Ordered JSON grammar composition; schema compilation belongs to the builder. */
function merge(current, incoming, path = []) {
    const key = path.at(-1);
    if (incoming === null) return structuredClone(current);
    if (path.length === 3 && ['abstracts', 'elements'].includes(path[0])
        && ['sub_tags', 'parent_tags', 'inherits_from'].includes(key) && typeof incoming === 'string') {
        const names = incoming.split(',').map(s => s.trim().split('[')[0]);
        if (new Set(names).size !== names.length) throw new TypeError(`duplicate name in ${key}`);
        if (!incoming || !current) return incoming;
        if (key === 'sub_tags' && current.trim() === '*' && !incoming.includes('[')) {
            parseCardinality(incoming, 'sub_tags');
            return '*';
        }
        const entries = new Map(current.split(',').map(s => [s.trim().split('[')[0], s.trim()]));
        for (const part of incoming.split(',')) entries.set(part.trim().split('[')[0], part.trim());
        return [...entries.values()].join(',');
    }
    if (path.length === 4 && path[2] === 'attributes' && key === 'parameters'
        && Array.isArray(current) && Array.isArray(incoming)) {
        const entries = new Map(current.map(p => [p.name, structuredClone(p)]));
        const seen = new Set();
        for (const param of incoming) {
            if (seen.has(param.name)) throw new TypeError(`duplicate parameter '${param.name}'`);
            seen.add(param.name);
            entries.set(param.name, structuredClone(param));
        }
        return [...entries.values()];
    }
    if (record(current) && record(incoming)) {
        const result = structuredClone(current);
        for (const [name, value] of Object.entries(incoming)) {
            if (value !== null) Object.defineProperty(result, name, {
                value: merge(result[name], value, [...path, name]), enumerable: true, writable: true, configurable: true,
            });
        }
        return result;
    }
    return structuredClone(incoming);
}
function record(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        && Object.getPrototypeOf(value) === Object.prototype;
}
function json(value) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
    if (typeof value === 'number' && Number.isFinite(value)) return;
    if (Array.isArray(value)) { value.forEach(json); return; }
    if (record(value)) { Object.values(value).forEach(json); return; }
    throw new TypeError('collection must contain only finite JSON values');
}
export class Collection {
    #document;
    constructor(document) {
        json(document);
        const keys = ['document_format', 'grammar', 'abstracts', 'elements'];
        if (!record(document) || Object.keys(document).length !== keys.length || keys.some(k => !Object.hasOwn(document, k))) {
            throw new TypeError('collection requires document_format, grammar, abstracts and elements');
        }
        const format = document.document_format;
        if (!record(format) || Object.keys(format).length !== 2 || format.name !== 'builder_grammar' || format.version !== '1.1') {
            throw new TypeError('expected builder_grammar version 1.1');
        }
        for (const section of ['grammar', 'abstracts', 'elements']) {
            if (!record(document[section])) throw new TypeError(`${section} must be an object`);
        }
        this.#document = structuredClone(document);
    }
    /** Compose subsequent declarations; absent/null fields preserve earlier values. */
    update(document) {
        const incoming = new Collection(document);
        this.#document = merge(this.#document, incoming.#document);
        return this;
    }
    /** Export independent JSON data, not a second representation of the grammar. */
    toDocument() { return structuredClone(this.#document); }
}
