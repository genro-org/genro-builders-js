// Copyright 2026 Softwell S.r.l. - SPDX-License-Identifier: Apache-2.0
/** Ordered JSON grammar composition; schema compilation belongs to the builder.
 *
 *  Composition rule (shared with genro-builders, Python): a document applied
 *  after another replaces, entirely, every `elements` and `abstracts` entry it
 *  names (parameters, sub_tags, parent_tags, inherits_from, ns, doc, _meta,
 *  node_label, collection_key). Entries it does not name are inherited
 *  unchanged. `grammar` metadata is still merged key by key; a null value
 *  keeps the earlier one. */
function merge(current, incoming, path = []) {
    if (incoming === null) return structuredClone(current);
    if (path.length === 2 && path[0] === 'custom_types' && current !== undefined) {
        if (!equalJson(current, incoming)) throw new TypeError(`conflicting custom type '${path[1]}'`);
        return structuredClone(current);
    }
    if (path.length === 2 && ['abstracts', 'elements'].includes(path[0])) return structuredClone(incoming);
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
function equalJson(a, b) {
    if (Object.is(a, b)) return true;
    if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => equalJson(x, b[i]));
    if (record(a) && record(b)) return Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(k => Object.hasOwn(b, k) && equalJson(a[k], b[k]));
    return false;
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
        if (!record(document) || Object.keys(document).some(k => ![...keys, 'custom_types'].includes(k)) || keys.some(k => !Object.hasOwn(document, k))) {
            throw new TypeError('collection requires document_format, grammar, abstracts and elements');
        }
        const format = document.document_format;
        if (!record(format) || Object.keys(format).length !== 2 || format.name !== 'builder_grammar' || !['1.1', '1.2'].includes(format.version)) {
            throw new TypeError('expected builder_grammar version 1.1 or 1.2');
        }
        for (const section of ['grammar', 'abstracts', 'elements']) {
            if (!record(document[section])) throw new TypeError(`${section} must be an object`);
        }
        if (Object.hasOwn(document, 'custom_types') && (format.version !== '1.2' || !record(document.custom_types))) {
            throw new TypeError('custom_types requires an object catalog and version 1.2');
        }
        this.#document = structuredClone(document);
    }
    /** Compose a later document: an element or abstract it names replaces the
     *  earlier entry entirely, the others are kept; `grammar` metadata merges
     *  and a null metadata value preserves the earlier one. */
    update(document) {
        const incoming = new Collection(document);
        const merged = merge(this.#document, incoming.#document);
        if (this.#document.document_format.version === '1.2' || incoming.#document.document_format.version === '1.2') merged.document_format.version = '1.2';
        this.#document = merged;
        return this;
    }
    /** Export independent JSON data, not a second representation of the grammar. */
    toDocument() { return structuredClone(this.#document); }
}
